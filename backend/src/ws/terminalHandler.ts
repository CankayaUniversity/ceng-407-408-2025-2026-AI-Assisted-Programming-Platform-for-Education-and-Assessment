/**
 * Interactive terminal WebSocket handler.
 *
 * Replaces the Judge0 batch execution path for the "Run" button.
 * Spawns a real child process, keeps stdin open so the user can type
 * into the xterm.js terminal, and streams stdout/stderr back in real time.
 *
 * Supported languages: python, javascript, c, cpp, csharp
 * C/C++ output is forced unbuffered via `stdbuf -i0 -o0 -e0`.
 * Python uses the -u (unbuffered) flag.
 * C# uses `dotnet run` with a minimal project file.
 *
 * Protocol:
 *   Client → Server:
 *     { type: "run",   token, language, code }   — start execution
 *     { type: "input", data: string }             — user keystroke(s)
 *     { type: "kill" }                            — Ctrl+C / kill
 *
 *   Server → Client:
 *     { type: "output", data: string }   — raw text to write to xterm
 *     { type: "done",   exitCode: number }
 *     { type: "error",  message: string }
 */

import { spawn, spawnSync, type ChildProcess } from "child_process";
import { writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { WebSocket } from "ws";
import { verifyAccessToken } from "../lib/authTokens";

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(ws: WebSocket, obj: object): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "ai-term-"));
}

function cleanup(dir: string | null): void {
  if (dir) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function fileExt(language: string): string {
  const map: Record<string, string> = {
    python: "py", javascript: "js", js: "js", node: "js",
    c: "c", cpp: "cpp", "c++": "cpp",
    csharp: "cs", "c#": "cs",
  };
  return map[language.toLowerCase()] ?? "txt";
}

const CSHARP_CSPROJ = [
  '<Project Sdk="Microsoft.NET.Sdk">',
  "  <PropertyGroup>",
  "    <OutputType>Exe</OutputType>",
  "    <TargetFramework>net8.0</TargetFramework>",
  "    <ImplicitUsings>enable</ImplicitUsings>",
  "    <Nullable>enable</Nullable>",
  "  </PropertyGroup>",
  "</Project>",
].join("\n");

// ── Compile step (C / C++) ────────────────────────────────────────────────────

async function compile(
  compiler: string,
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(compiler, args, { cwd });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code)  => resolve({ ok: code === 0, stderr }));
    proc.on("error", (err)   => resolve({ ok: false, stderr: err.message }));
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleTerminalConnection(ws: WebSocket): Promise<void> {
  let child: ChildProcess | null = null;
  let tmpDir: string | null = null;
  let killTimer: ReturnType<typeof setTimeout> | null = null;

  function stopChild(): void {
    if (killTimer) { clearTimeout(killTimer); killTimer = null; }
    child?.kill("SIGKILL");
    child = null;
    cleanup(tmpDir);
    tmpDir = null;
  }

  ws.on("message", async (raw: Buffer | string) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // ── Run ───────────────────────────────────────────────────────────────
    if (msg.type === "run") {
      stopChild(); // kill any previous run

      // Auth
      try { verifyAccessToken(msg.token as string); }
      catch {
        send(ws, { type: "error", message: "Unauthorized" });
        ws.close();
        return;
      }

      const language = (msg.language as string ?? "python").toLowerCase();
      const code     = (msg.code     as string ?? "");

      tmpDir = makeTempDir();
      const ext      = fileExt(language);
      const codeFile = join(tmpDir, `main.${ext}`);
      const binFile  = join(tmpDir, "program");

      writeFileSync(codeFile, code, "utf-8");

      // ── Compile if needed ─────────────────────────────────────────────
      if (language === "c" || language === "cpp" || language === "c++") {
        send(ws, { type: "output", data: "\x1b[33mCompiling…\x1b[0m\r\n" });
        const compiler = language === "c" ? "gcc" : "g++";
        const result   = await compile(compiler, [codeFile, "-o", binFile, "-lm"], tmpDir);
        if (!result.ok) {
          send(ws, { type: "output", data: `\x1b[31mCompile error:\r\n${result.stderr.replace(/\n/g, "\r\n")}\x1b[0m\r\n` });
          send(ws, { type: "done", exitCode: 1 });
          cleanup(tmpDir); tmpDir = null;
          return;
        }
        send(ws, { type: "output", data: "\x1b[32mCompiled OK\x1b[0m\r\n" });
      }

      if (language === "csharp" || language === "c#") {
        // Write a minimal project file alongside the code so dotnet can build it
        writeFileSync(join(tmpDir, "app.csproj"), CSHARP_CSPROJ, "utf-8");
        send(ws, { type: "output", data: "\x1b[33mCompiling C#…\x1b[0m\r\n" });

        // dotnet build output goes to stdout — capture both streams
        const buildProc = spawnSync(
          "dotnet", ["build", "--nologo", "-o", join(tmpDir, "bin")],
          { cwd: tmpDir, encoding: "utf-8" },
        );
        if (buildProc.status !== 0) {
          const raw = ((buildProc.stdout ?? "") + (buildProc.stderr ?? "")).trim();
          // Surface only the lines that actually contain an error
          const errorLines = raw.split("\n").filter((l) => /error/i.test(l)).join("\n").trim();
          send(ws, { type: "output", data: `\x1b[31mCompile error:\r\n${(errorLines || raw).replace(/\n/g, "\r\n")}\x1b[0m\r\n` });
          send(ws, { type: "done", exitCode: 1 });
          cleanup(tmpDir); tmpDir = null;
          return;
        }
        send(ws, { type: "output", data: "\x1b[32mCompiled OK\x1b[0m\r\n" });
      }

      // ── Build spawn arguments ─────────────────────────────────────────
      let command: string;
      let args: string[];

      switch (language) {
        case "python":
          command = "python3"; args = ["-u", codeFile]; break;
        case "javascript": case "js": case "node":
          command = "node";    args = [codeFile];        break;
        case "c": case "cpp": case "c++":
          // stdbuf forces unbuffered I/O so printf without \n still appears immediately
          command = "stdbuf"; args = ["-i0", "-o0", "-e0", binFile]; break;
        case "csharp": case "c#":
          // Run the pre-compiled DLL directly; Console I/O is unbuffered by default in .NET
          command = "dotnet"; args = [join(tmpDir, "bin", "app.dll")]; break;
        default:
          command = "python3"; args = ["-u", codeFile]; break;
      }

      child = spawn(command, args, {
        cwd: tmpDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      // Kill after 30 s
      killTimer = setTimeout(() => {
        send(ws, { type: "output", data: "\r\n\x1b[31m[Timed out after 30 s]\x1b[0m\r\n" });
        send(ws, { type: "done",   exitCode: -1 });
        stopChild();
      }, 30_000);

      child.stdout?.on("data", (d: Buffer) => {
        send(ws, { type: "output", data: d.toString() });
      });

      child.stderr?.on("data", (d: Buffer) => {
        send(ws, { type: "output", data: `\x1b[31m${d.toString()}\x1b[0m` });
      });

      child.on("close", (code) => {
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
        send(ws, { type: "done", exitCode: code ?? 0 });
        cleanup(tmpDir); tmpDir = null; child = null;
      });

      child.on("error", (err) => {
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
        send(ws, { type: "output", data: `\x1b[31m[Spawn error: ${err.message}]\x1b[0m\r\n` });
        send(ws, { type: "done",   exitCode: -1 });
        cleanup(tmpDir); tmpDir = null; child = null;
      });

    // ── Input (user typing) ───────────────────────────────────────────────
    } else if (msg.type === "input" && child?.stdin) {
      child.stdin.write(msg.data as string);

    // ── EOF (Ctrl+D) — close stdin so programs reading until EOF can finish
    } else if (msg.type === "eof" && child?.stdin) {
      child.stdin.end();

    // ── Kill ──────────────────────────────────────────────────────────────
    } else if (msg.type === "kill") {
      if (child) {
        send(ws, { type: "output", data: "\r\n\x1b[33m[Killed]\x1b[0m\r\n" });
        send(ws, { type: "done",   exitCode: -1 });
        stopChild();
      }
    }
  });

  ws.on("close", () => stopChild());
  ws.on("error", () => stopChild());
}
