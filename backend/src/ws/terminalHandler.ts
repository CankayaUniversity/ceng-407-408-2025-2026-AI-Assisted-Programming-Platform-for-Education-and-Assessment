/**
 * Interactive terminal WebSocket handler.
 *
 * Replaces the Judge0 batch execution path for the "Run" button.
 * Spawns a real child process, keeps stdin open so the user can type
 * into the xterm.js terminal, and streams stdout/stderr back in real time.
 *
 * Supported languages: python, javascript, c, cpp, csharp, java
 * C/C++ output is forced unbuffered via `stdbuf -i0 -o0 -e0`.
 * Python uses the -u (unbuffered) flag.
 * C# uses `dotnet run` with a minimal project file.
 * Java: code is written to Main.java; students must use `public class Main`.
 *
 * Sandbox limits applied to every run (via ulimit in a wrapping shell):
 *   -f 20480   max file writes: 10 MB  (20480 × 512-byte blocks)
 *   -u 64      max processes:   64     (prevents fork bombs)
 *   -t 25      CPU time:        25 s   (wall-clock kill is 30 s)
 * Java additionally gets -Xmx256m / -Xss4m to cap heap + stack.
 * Compile steps are limited to COMPILE_TIMEOUT_MS (20 s).
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

// ── Sandbox helpers ───────────────────────────────────────────────────────────

/**
 * ulimit flags applied before every student process (best-effort).
 *   -f  max file size in 512-byte blocks (20480 = 10 MB)
 *   -u  max user processes               (64 — prevents fork bombs)
 *   -t  CPU time in seconds              (25 s — belt-and-suspenders with the 30 s wall timer)
 *
 * We deliberately omit -v (virtual memory) because the JVM and .NET runtime
 * both map large virtual address ranges at startup and would be killed immediately.
 * Java heap is capped separately via -Xmx256m.
 *
 * NOTE: Some Docker configurations deny ulimit -u without extra capabilities.
 *       We use "|| true" so a failed ulimit never blocks the exec that follows.
 */
const ULIMIT_PREFIX = "ulimit -f 20480 -u 64 -t 25 2>/dev/null || true";

const COMPILE_TIMEOUT_MS = 20_000; // 20 s max for compilation

/** Single-quote a string so it is safe to embed in a POSIX shell command. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Spawn a student process inside a sandboxed shell.
 *
 * The shell applies ulimit constraints then exec()s the real binary,
 * transferring the limits to the student process without leaving a
 * wrapper shell process alive.
 */
function spawnSandboxed(
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
): ReturnType<typeof spawn> {
  const cmd = `${ULIMIT_PREFIX} && exec ${[command, ...args].map(shellQuote).join(" ")}`;
  return spawn("sh", ["-c", cmd], options);
}

function fileExt(language: string): string {
  const map: Record<string, string> = {
    python: "py", javascript: "js", js: "js", node: "js",
    c: "c", cpp: "cpp", "c++": "cpp",
    csharp: "cs", "c#": "cs",
    java: "java",
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

// ── Compile step ──────────────────────────────────────────────────────────────

async function compile(
  compiler: string,
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(compiler, args, { cwd });
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      resolve({ ok: false, stderr: `Compilation timed out after ${COMPILE_TIMEOUT_MS / 1000} s` });
    }, COMPILE_TIMEOUT_MS);

    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: code === 0, stderr });
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, stderr: err.message });
    });
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
      // Java: filename must match the public class name (we standardise on "Main")
      const codeFile = language === "java"
        ? join(tmpDir, "Main.java")
        : join(tmpDir, `main.${ext}`);
      const binFile  = join(tmpDir, "program");

      writeFileSync(codeFile, code, "utf-8");

      // ── Node.js /dev/stdin compatibility shim ────────────────────────
      // In Docker containers the backend runs detached (no host stdin), so
      // /dev/stdin is a closed character device rather than a symlink to
      // /proc/self/fd/0.  Student code that calls
      //   fs.readFileSync('/dev/stdin', 'utf8')
      // therefore gets ENXIO.  We inject a tiny --require preload that
      // patches fs.readFileSync to fall back to direct fd-0 reads, which
      // DO go through the pipe we set up via child.stdin.write().
      const stdinCompatFile = join(tmpDir, "__stdin_compat__.js");
      writeFileSync(stdinCompatFile, `
// Auto-generated stdin compatibility shim — do not edit.
(function() {
  var _fs = require('fs');
  var STDIN_PATHS = ['/dev/stdin', '/dev/fd/0', '/proc/self/fd/0'];
  var _orig = _fs.readFileSync.bind(_fs);
  _fs.readFileSync = function readFileSync(p, opts) {
    if (typeof p === 'string' && STDIN_PATHS.indexOf(p) !== -1) {
      var enc = typeof opts === 'string' ? opts : (opts && opts.encoding) || null;
      var chunks = [];
      var buf = Buffer.allocUnsafe(4096);
      var n;
      try {
        // eslint-disable-next-line no-empty
        while ((n = _fs.readSync(0, buf, 0, 4096)) > 0) {
          chunks.push(Buffer.from(buf.slice(0, n)));
        }
      } catch (e) {
        if (e.code !== 'EAGAIN' && e.code !== 'EOF') throw e;
      }
      var raw = Buffer.concat(chunks);
      return enc ? raw.toString(enc) : raw;
    }
    return _orig(p, opts);
  };
})();
`.trim(), "utf-8");

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

      if (language === "java") {
        send(ws, { type: "output", data: "\x1b[33mCompiling…\x1b[0m\r\n" });
        const result = await compile("javac", [codeFile], tmpDir);
        if (!result.ok) {
          send(ws, { type: "output", data: `\x1b[31mCompile error:\r\n${result.stderr.replace(/\n/g, "\r\n")}\x1b[0m\r\n` });
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
          // --require loads the stdin compat shim before the student's code runs,
          // fixing readFileSync('/dev/stdin') in Docker (ENXIO on closed device).
          command = "node"; args = ["--require", stdinCompatFile, codeFile]; break;
        case "c": case "cpp": case "c++":
          // stdbuf forces unbuffered I/O so printf without \n still appears immediately
          command = "stdbuf"; args = ["-i0", "-o0", "-e0", binFile]; break;
        case "csharp": case "c#":
          // Run the pre-compiled DLL directly; Console I/O is unbuffered by default in .NET
          command = "dotnet"; args = [join(tmpDir, "bin", "app.dll")]; break;
        case "java":
          // -Xmx256m caps heap; -Xss4m caps thread stack; ulimit -v is skipped for JVM compatibility
          command = "java"; args = ["-Xmx256m", "-Xss4m", "-cp", tmpDir, "Main"]; break;
        default:
          command = "python3"; args = ["-u", codeFile]; break;
      }

      child = spawnSandboxed(command, args, {
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
        const text = d.toString();
        send(ws, { type: "output", data: `\x1b[31m${text}\x1b[0m` });

        // Browser-API hint — students often write DOM code expecting a browser.
        if (
          (language === "javascript" || language === "js") &&
          /\b(document|window|alert|localStorage|sessionStorage)\s+is not defined/.test(text)
        ) {
          send(ws, {
            type: "output",
            data:
              "\x1b[33m[Hint] This platform runs JavaScript with Node.js, not in a browser.\r\n" +
              "       DOM APIs (document, window, alert, localStorage, etc.) are not available.\r\n" +
              "       Use console.log() for output and process.stdin / readline for input.\r\n" +
              "       To read all stdin at once: const rl = require('readline').createInterface({input:process.stdin});\x1b[0m\r\n",
          });
        }
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
