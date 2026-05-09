/**
 * Interactive terminal WebSocket handler — Docker container-per-session (Option B).
 *
 * Each "run" spawns a disposable Docker container with:
 *   --rm              auto-deleted on exit
 *   --network none    no outbound internet access
 *   --memory 128m     RAM cap
 *   --cpus 0.5        CPU cap
 *   --pids-limit 64   fork-bomb protection
 *   --cap-drop ALL    no Linux capabilities
 *   --security-opt no-new-privileges
 *   --tmpfs /tmp      writable scratch space inside container
 *
 * Code files are written to a per-session host directory
 * (RUNNER_TMP_HOST/<sessionId>) then bind-mounted into the container as /code.
 *
 * Supported languages: python, javascript, c, cpp, csharp, java
 *
 * Protocol (unchanged from previous implementation — frontend requires no changes):
 *   Client → Server:
 *     { type: "run",   token, language, code }
 *     { type: "input", data: string }
 *     { type: "eof" }
 *     { type: "kill" }
 *
 *   Server → Client:
 *     { type: "output", data: string }
 *     { type: "done",   exitCode: number }
 *     { type: "error",  message: string }
 */

import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join }                             from "path";
import { randomBytes }                      from "crypto";
import type { WebSocket }                   from "ws";
import { verifyAccessToken }                from "../lib/authTokens";

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * RUNNER_TMP_CONTAINER — path inside the backend container where the shared
 *   host directory is mounted. The backend writes code files here.
 *
 * RUNNER_TMP_HOST — the equivalent path on the Docker HOST.  This is what
 *   we pass to `docker run -v <host>:/code` so the Docker daemon can find it.
 *
 * docker-compose.yml must mount:
 *   /tmp/ai-runner:/runner-tmp   (host:backend-container)
 * so both paths refer to the same underlying directory tree on the host.
 */
const RUNNER_TMP_CONTAINER = process.env.RUNNER_TMP_CONTAINER ?? "/runner-tmp";
const RUNNER_TMP_HOST      = process.env.RUNNER_TMP_HOST      ?? "/tmp/ai-runner";

const COMPILE_TIMEOUT_MS = 20_000; //  20 s — hard limit for compile step
const RUN_TIMEOUT_MS     = 30_000; //  30 s — hard limit for execution

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(ws: WebSocket, obj: object): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function makeSessionDir(): { containerPath: string; hostPath: string } {
  const id            = randomBytes(8).toString("hex");
  const containerPath = join(RUNNER_TMP_CONTAINER, id);
  const hostPath      = `${RUNNER_TMP_HOST}/${id}`;
  mkdirSync(containerPath, { recursive: true });
  return { containerPath, hostPath };
}

function cleanupDir(path: string): void {
  try { rmSync(path, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Language configuration ────────────────────────────────────────────────────

/**
 * codeFile             — filename written to /code inside the container.
 * compileCmd           — optional shell command run BEFORE execution in a
 *                        separate non-interactive container.
 *                        stdout+stderr from this container are captured and
 *                        shown as a compile-error report.
 * compileNeedsNetwork  — if true the compile container gets default bridge
 *                        networking instead of --network none.  Needed for
 *                        C# so dotnet can restore NuGet packages.  The run
 *                        container always uses --network none.
 * runCmd               — shell command run in the interactive execution container.
 * extraFiles           — additional files to write to the session directory
 *                        (project files, shims…).
 * image                — Docker image tag.
 * extraFlags           — extra `docker run` flags appended to BOTH compile and
 *                        run steps (e.g. NuGet cache volume for C#).
 */
type LangConfig = {
  image:                string;
  codeFile:             string;
  compileCmd?:          string;
  compileNeedsNetwork?: boolean;
  runCmd:               string;
  extraFiles?:          Record<string, string>;
  extraFlags?:          string[];
};

// Node.js stdin-compat shim — fixes readFileSync('/dev/stdin') inside Docker
// where /dev/stdin is a closed character device rather than a real pipe.
const NODE_STDIN_SHIM = `
(function () {
  var _fs  = require('fs');
  var PATHS = ['/dev/stdin', '/dev/fd/0', '/proc/self/fd/0'];
  var orig = _fs.readFileSync.bind(_fs);
  function readAll(opts) {
    var enc = typeof opts === 'string' ? opts : (opts && opts.encoding) || null;
    var chunks = [], buf = Buffer.allocUnsafe(4096), n;
    try { while ((n = _fs.readSync(0, buf, 0, 4096)) > 0) chunks.push(Buffer.from(buf.slice(0, n))); }
    catch (e) { if (e.code !== 'EAGAIN' && e.code !== 'EOF') throw e; }
    var raw = Buffer.concat(chunks);
    return enc ? raw.toString(enc) : raw;
  }
  _fs.readFileSync = function (p, opts) {
    if ((typeof p === 'string' && PATHS.indexOf(p) !== -1) || p === 0) return readAll(opts);
    return orig(p, opts);
  };
})();
`.trim();

const CSHARP_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;

function getLangConfig(lang: string): LangConfig | null {
  switch (lang) {
    case "python":
      return {
        image:    "python:3.12-slim",
        codeFile: "main.py",
        runCmd:   "python3 -u /code/main.py",
      };

    case "javascript": case "js": case "node":
      return {
        image:      "node:20-slim",
        codeFile:   "main.js",
        extraFiles: { "__shim__.js": NODE_STDIN_SHIM },
        runCmd:     "node --require /code/__shim__.js /code/main.js",
      };

    case "c":
      return {
        image:      "gcc:13",
        codeFile:   "main.c",
        compileCmd: "gcc /code/main.c -o /code/out -lm -O2",
        runCmd:     "stdbuf -i0 -o0 -e0 /code/out",
      };

    case "cpp": case "c++":
      return {
        image:      "gcc:13",
        codeFile:   "main.cpp",
        compileCmd: "g++ /code/main.cpp -o /code/out -lm -O2",
        runCmd:     "stdbuf -i0 -o0 -e0 /code/out",
      };

    case "java":
      return {
        image:      "eclipse-temurin:21-jdk-alpine",
        codeFile:   "Main.java",
        compileCmd: "javac -d /code /code/Main.java",
        runCmd:     "java -Xmx256m -Xss4m -cp /code Main",
      };

    case "csharp": case "c#":
      return {
        image:               "mcr.microsoft.com/dotnet/sdk:8.0-alpine",
        codeFile:            "main.cs",
        extraFiles:          { "app.csproj": CSHARP_CSPROJ },
        // Build output goes to /code/bin so it is reachable by the run step
        compileCmd:          "dotnet build --nologo -o /code/bin /code/app.csproj",
        // NuGet restore requires outbound internet access; --network none would
        // block it and the first (and every subsequent cold-cache) build would fail.
        // The NuGet volume persists across sessions so subsequent restores hit cache.
        compileNeedsNetwork: true,
        runCmd:              "dotnet /code/bin/app.dll",
        // Named NuGet cache volume shared across all C# containers
        extraFlags:          ["-v", "ai-runner-nuget:/root/.nuget"],
      };

    default:
      return null;
  }
}

// ── Docker flags ──────────────────────────────────────────────────────────────

/** Flags applied to every container (compile + run). */
const DOCKER_BASE_FLAGS = [
  "--rm",
  "--memory",       "128m",
  "--memory-swap",  "128m",
  "--cpus",         "0.5",
  "--pids-limit",   "64",
  "--cap-drop",     "ALL",
  "--security-opt", "no-new-privileges",
  "--tmpfs",        "/tmp:size=64m",
];

/** Run containers are always fully network-isolated. */
const DOCKER_RUN_FLAGS  = [...DOCKER_BASE_FLAGS, "--network", "none"];

/**
 * Compile containers use --network none by default.
 * Pass `networkEnabled: true` to allow outbound access (needed for C# NuGet restore).
 */
function buildCompileFlags(networkEnabled: boolean): string[] {
  return networkEnabled
    ? DOCKER_BASE_FLAGS                            // default bridge networking
    : [...DOCKER_BASE_FLAGS, "--network", "none"]; // fully isolated
}

// ── Compile in Docker (non-interactive) ───────────────────────────────────────

async function compileInDocker(
  hostCodePath: string,
  config:       LangConfig,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const args = [
      "run",
      ...buildCompileFlags(config.compileNeedsNetwork ?? false),
      ...(config.extraFlags ?? []),
      "-v", `${hostCodePath}:/code`,
      config.image,
      "sh", "-c", config.compileCmd!,
    ];

    const proc = spawn("docker", args);
    let output  = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      resolve({ ok: false, output: `Compilation timed out after ${COMPILE_TIMEOUT_MS / 1000} s` });
    }, COMPILE_TIMEOUT_MS);

    // Capture both stdout and stderr — compilers mix them freely
    proc.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { output += d.toString(); });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: code === 0, output });
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, output: `docker error: ${err.message}` });
    });
  });
}

// ── Main WebSocket handler ────────────────────────────────────────────────────

export async function handleTerminalConnection(ws: WebSocket): Promise<void> {
  let child:        ChildProcess | null = null;
  let containerDir: string | null       = null;
  let killTimer:    ReturnType<typeof setTimeout> | null = null;

  function stopChild(): void {
    if (killTimer) { clearTimeout(killTimer); killTimer = null; }
    child?.kill("SIGKILL");
    child = null;
    if (containerDir) { cleanupDir(containerDir); containerDir = null; }
  }

  ws.on("message", async (raw: Buffer | string) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // ── run ───────────────────────────────────────────────────────────────────
    if (msg.type === "run") {
      stopChild(); // terminate any previous session

      // Verify JWT sent by the client
      try { verifyAccessToken(msg.token as string); }
      catch {
        send(ws, { type: "error", message: "Unauthorized" });
        ws.close();
        return;
      }

      const language = ((msg.language as string) ?? "python").toLowerCase();
      const code     = (msg.code as string) ?? "";

      const config = getLangConfig(language);
      if (!config) {
        send(ws, { type: "error", message: `Unsupported language: ${language}` });
        send(ws, { type: "done",  exitCode: 1 });
        return;
      }

      // Create per-session directory (visible inside backend at containerPath,
      // visible to Docker daemon on the host at hostPath)
      const { containerPath, hostPath } = makeSessionDir();
      containerDir = containerPath;

      // Write student's code
      writeFileSync(join(containerPath, config.codeFile), code, "utf-8");

      // Write auxiliary files (shims, .csproj, …)
      for (const [name, content] of Object.entries(config.extraFiles ?? {})) {
        writeFileSync(join(containerPath, name), content, "utf-8");
      }

      // ── Compile step (compiled languages only) ────────────────────────────
      if (config.compileCmd) {
        send(ws, { type: "output", data: "\x1b[33mCompiling…\x1b[0m\r\n" });

        const result = await compileInDocker(hostPath, config);

        if (!result.ok) {
          send(ws, {
            type: "output",
            data: `\x1b[31mCompile error:\r\n${result.output.replace(/\n/g, "\r\n")}\x1b[0m\r\n`,
          });
          send(ws, { type: "done", exitCode: 1 });
          cleanupDir(containerPath);
          containerDir = null;
          return;
        }

        // Show compiler warnings (non-fatal output) in yellow
        if (result.output.trim()) {
          send(ws, {
            type: "output",
            data: `\x1b[33m${result.output.trim().replace(/\n/g, "\r\n")}\x1b[0m\r\n`,
          });
        }
        send(ws, { type: "output", data: "\x1b[32mCompiled OK\x1b[0m\r\n" });
      }

      // ── Interactive execution container (always network-isolated) ─────────
      const runArgs = [
        "run",
        ...DOCKER_RUN_FLAGS,
        ...(config.extraFlags ?? []),
        "-i",               // keep stdin open for interactive programs
        "-v", `${hostPath}:/code`,
        config.image,
        "sh", "-c", config.runCmd,
      ];

      child = spawn("docker", runArgs, {
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      // 30-second wall-clock kill
      killTimer = setTimeout(() => {
        send(ws, { type: "output", data: "\r\n\x1b[31m[Timed out after 30 s]\x1b[0m\r\n" });
        send(ws, { type: "done",   exitCode: -1 });
        stopChild();
      }, RUN_TIMEOUT_MS);

      child.stdout?.on("data", (d: Buffer) => {
        send(ws, { type: "output", data: d.toString() });
      });

      child.stderr?.on("data", (d: Buffer) => {
        const text = d.toString();
        send(ws, { type: "output", data: `\x1b[31m${text}\x1b[0m` });

        // Browser-API hint for students who accidentally write DOM code in Node
        if (
          (language === "javascript" || language === "js") &&
          /\b(document|window|alert|localStorage|sessionStorage)\s+is not defined/.test(text)
        ) {
          send(ws, {
            type: "output",
            data:
              "\x1b[33m[Hint] This platform runs JavaScript with Node.js, not in a browser.\r\n" +
              "       DOM APIs (document, window, alert, localStorage…) are not available.\r\n" +
              "       Use console.log() for output and process.stdin / readline for input.\x1b[0m\r\n",
          });
        }
      });

      child.on("close", (code) => {
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
        send(ws, { type: "done", exitCode: code ?? 0 });
        cleanupDir(containerPath);
        containerDir = null;
        child        = null;
      });

      child.on("error", (err) => {
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
        send(ws, { type: "output", data: `\x1b[31m[Docker error: ${err.message}]\x1b[0m\r\n` });
        send(ws, { type: "done",   exitCode: -1 });
        cleanupDir(containerPath);
        containerDir = null;
        child        = null;
      });

    // ── input (user keystrokes) ───────────────────────────────────────────────
    } else if (msg.type === "input" && child?.stdin) {
      child.stdin.write(msg.data as string);

    // ── eof (Ctrl+D) — close stdin so programs reading until EOF can finish ───
    } else if (msg.type === "eof" && child?.stdin) {
      child.stdin.end();

    // ── kill ──────────────────────────────────────────────────────────────────
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
