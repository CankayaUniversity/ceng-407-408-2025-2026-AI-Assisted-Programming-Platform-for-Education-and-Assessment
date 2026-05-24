/**
 * Docker-based code runner for test-case evaluation (the SUBMIT path).
 *
 * Why not Judge0?
 *   Judge0 1.13.1 always invokes the `isolate` sandbox binary for every
 *   submission, regardless of ENABLE_SANDBOX=false. `isolate` v1.x requires
 *   cgroup v1, but our deployment server uses cgroup v2 (unified hierarchy),
 *   which causes isolate to hang on every submission and report a spurious
 *   "Time Limit Exceeded" with empty stdout (verified in worker logs:
 *   exit_code=0, cpu_time=0.002s, wall_time=10.101s on every run).
 *
 *   The project proposal (PPF_FST) explicitly lists both "Judge0" AND
 *   "Docker-based execution environments" under Code Execution Sandbox,
 *   so this choice is within the documented spec.
 *
 * Mirrors the interactive terminal (terminalHandler.ts) but runs
 * non-interactively, suitable for batch test execution:
 *   - Compiles once for compiled languages (C, C++, Java, C#)
 *   - Runs each test case by piping stdin, captures stdout/stderr
 *   - Returns a Judge0RunResult-compatible object so execute.ts and the
 *     downstream status-mapping logic don't need to change.
 *
 * Security boundary (matches the terminal path, per architecture doc):
 *   --network none           outbound network blocked
 *   --cap-drop ALL           no Linux capabilities
 *   --security-opt no-new-privileges
 *   --memory 128m            RAM cap
 *   --cpus 0.5               CPU cap
 *   --pids-limit 64          fork-bomb protection
 *   --tmpfs /tmp             writable scratch space
 */

import { spawn }                            from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join }                             from "path";
import { randomBytes }                      from "crypto";
import type { Judge0RunResult }             from "./judge0";

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * The backend container mounts the host's /tmp/ai-runner at /runner-tmp.
 * We write code files to the container path; the Docker daemon (running on
 * the host) sees the same files at the host path when we bind-mount.
 */
const RUNNER_TMP_CONTAINER = process.env.RUNNER_TMP_CONTAINER ?? "/runner-tmp";
const RUNNER_TMP_HOST      = process.env.RUNNER_TMP_HOST      ?? "/tmp/ai-runner";

const COMPILE_TIMEOUT_MS     = 30_000;  // 30 s per compile step
const DEFAULT_RUN_TIMEOUT_MS = 15_000;  // 15 s per test case (wall clock)

// ── Language configs (shared model with terminalHandler) ──────────────────────

/**
 * Node.js stdin shim. Patches readFileSync(0) / readFileSync('/dev/stdin') so
 * student code that uses these idioms works correctly inside Docker, where
 * /dev/stdin is a closed character device rather than a pipe. The shim falls
 * back to a synchronous-read loop on fd 0.
 */
const NODE_STDIN_SHIM = `(function(){var f=require('fs'),P=['/dev/stdin','/dev/fd/0','/proc/self/fd/0'],o=f.readFileSync.bind(f);function r(opts){var e=typeof opts==='string'?opts:(opts&&opts.encoding)||null,c=[],b=Buffer.allocUnsafe(4096),n;try{while((n=f.readSync(0,b,0,4096))>0)c.push(Buffer.from(b.slice(0,n)));}catch(e){if(e.code!=='EAGAIN'&&e.code!=='EOF')throw e;}var raw=Buffer.concat(c);return e?raw.toString(e):raw;}f.readFileSync=function(p,opts){if((typeof p==='string'&&P.indexOf(p)!==-1)||p===0)return r(opts);return o(p,opts);};})();`;

const CSHARP_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;

type LangConfig = {
  image:                string;
  codeFile:             string;
  compileCmd?:          string;
  compileNeedsNetwork?: boolean;
  runCmd:               string;
  extraFiles?:          Record<string, string>;
  extraFlags?:          string[];
};

function getLangConfig(lang: string): LangConfig | null {
  switch (lang.trim().toLowerCase()) {
    case "python": case "py":
      return {
        image:    "python:3.12-slim",
        codeFile: "main.py",
        runCmd:   "python3 -u /code/main.py",
      };

    case "javascript": case "js":
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
        compileCmd:          "dotnet build --nologo -o /code/bin /code/app.csproj",
        compileNeedsNetwork: true,
        runCmd:              "dotnet /code/bin/app.dll",
        extraFlags:          ["-v", "ai-runner-nuget:/root/.nuget"],
      };

    default:
      return null;
  }
}

// ── Docker flags ──────────────────────────────────────────────────────────────

/** Flags applied to every RUN container (test case execution). */
const DOCKER_RUN_BASE_FLAGS = [
  "--rm",
  "--memory",       "128m",
  "--memory-swap",  "128m",
  "--cpus",         "0.5",
  "--pids-limit",   "64",
  "--cap-drop",     "ALL",
  "--security-opt", "no-new-privileges",
  "--tmpfs",        "/tmp:size=64m",
  "--network",      "none",          // test runs never need network
];

/** Compile containers get slightly more resources and may need network (C# NuGet). */
function buildCompileFlags(networkEnabled: boolean): string[] {
  return [
    "--rm",
    "--memory",       "512m",
    "--memory-swap",  "512m",
    "--cpus",         "1.0",
    "--pids-limit",   "128",
    "--cap-drop",     "ALL",
    "--security-opt", "no-new-privileges",
    "--tmpfs",        "/tmp:size=64m",
    ...(networkEnabled ? [] : ["--network", "none"]),
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/**
 * Run a `docker run …` command, pipe `stdinData` into the container, and
 * capture stdout+stderr. Resolves once the container exits or the wall-clock
 * timeout fires (in which case the container is SIGKILL'd).
 */
function runDockerContainer(params: {
  args:      string[];
  stdinData: string;
  timeoutMs: number;
}): Promise<{
  stdout:   string;
  stderr:   string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const proc = spawn("docker", params.args, {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    let stdout  = "";
    let stderr  = "";
    let settled = false;

    const MAX_OUTPUT = 100_000; // 100 KB per stream — protects against giant outputs

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      resolve({
        stdout:   stdout.slice(0, MAX_OUTPUT),
        stderr:   stderr.slice(0, MAX_OUTPUT),
        exitCode: null,
        timedOut: true,
      });
    }, params.timeoutMs);

    proc.stdout?.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout:   stdout.slice(0, MAX_OUTPUT),
        stderr:   stderr.slice(0, MAX_OUTPUT),
        exitCode: code,
        timedOut: false,
      });
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr:   stderr + `\n[docker error: ${err.message}]`,
        exitCode: -1,
        timedOut: false,
      });
    });

    // Feed stdin then close it so programs reading until EOF can finish.
    //
    // The 'error' handler is critical: if the container exits before reading
    // all of stdin (e.g. the program crashes immediately, or exits without
    // reading), write/end will emit EPIPE on the stdin stream. Without a
    // listener this becomes an unhandled 'error' event and crashes the entire
    // Node.js process.
    if (proc.stdin) {
      proc.stdin.on("error", () => {
        // Swallow EPIPE / ECONNRESET — container exited before consuming stdin.
        // The exit code + stderr already capture what went wrong.
      });
      try {
        if (params.stdinData.length > 0) {
          proc.stdin.write(params.stdinData);
        }
        proc.stdin.end();
      } catch {
        // Same case as above but for synchronous throw paths.
      }
    }
  });
}

// ── DockerSession ─────────────────────────────────────────────────────────────

/**
 * A session compiles the source code once (for compiled languages) and then
 * lets you `run()` each test case without recompiling. For interpreted
 * languages there is no compile step; each `run()` spawns a fresh container.
 */
export type DockerSession = {
  /** Run one test case with the given stdin. Returns a Judge0RunResult. */
  run:     (stdin: string, timeoutMs?: number) => Promise<Judge0RunResult>;
  /** Remove the session directory. Call after all test cases are done. */
  cleanup: () => void;
};

type SessionState =
  | { kind: "compile_error"; compileOutput: string }
  | { kind: "ready"; hostPath: string; config: LangConfig };

/**
 * Create a Docker session for the given sourceCode + language.
 * If the language requires compilation, compiles immediately and returns a
 * session whose `run()` always reports a compile-error result.
 *
 * Throws if the language is unsupported.
 */
export async function createDockerSession(
  sourceCode: string,
  language:   string,
): Promise<DockerSession> {
  const config = getLangConfig(language);
  if (!config) {
    throw new Error(`Unsupported language for Docker runner: "${language}"`);
  }

  const { containerPath, hostPath } = makeSessionDir();

  // Write source + auxiliary files (shims, .csproj, etc.)
  writeFileSync(join(containerPath, config.codeFile), sourceCode, "utf-8");
  for (const [name, content] of Object.entries(config.extraFiles ?? {})) {
    writeFileSync(join(containerPath, name), content, "utf-8");
  }

  let state: SessionState;

  // ── Compile step (compiled languages only) ──────────────────────────────────
  if (config.compileCmd) {
    const compileArgs = [
      "run",
      ...buildCompileFlags(config.compileNeedsNetwork ?? false),
      ...(config.extraFlags ?? []),
      "-v", `${hostPath}:/code`,
      config.image,
      "sh", "-c", config.compileCmd,
    ];

    const result = await runDockerContainer({
      args:      compileArgs,
      stdinData: "",
      timeoutMs: COMPILE_TIMEOUT_MS,
    });

    const compileOutput = (result.stdout + result.stderr).trim();

    if (result.timedOut || result.exitCode !== 0) {
      state = {
        kind:          "compile_error",
        compileOutput: compileOutput || "Compilation failed",
      };
    } else {
      state = { kind: "ready", hostPath, config };
    }
  } else {
    state = { kind: "ready", hostPath, config };
  }

  // ── Session interface ───────────────────────────────────────────────────────
  return {
    run: async (stdin: string, timeoutMs = DEFAULT_RUN_TIMEOUT_MS): Promise<Judge0RunResult> => {
      if (state.kind === "compile_error") {
        return {
          statusId:          6,   // Compile Error (Judge0 convention)
          statusDescription: "Compile Error",
          stdout:            "",
          stderr:            state.compileOutput,
          compileOutput:     state.compileOutput,
          time:              null,
          memory:            null,
        };
      }

      const { hostPath: hp, config: cfg } = state;

      const runArgs = [
        "run",
        ...DOCKER_RUN_BASE_FLAGS,
        ...(cfg.extraFlags ?? []),
        "-i",              // keep stdin open so we can pipe test input in
        "-v", `${hp}:/code`,
        cfg.image,
        "sh", "-c", cfg.runCmd,
      ];

      const start  = Date.now();
      const result = await runDockerContainer({
        args:      runArgs,
        stdinData: stdin,
        timeoutMs,
      });
      const elapsedSec = ((Date.now() - start) / 1000).toFixed(3);

      if (result.timedOut) {
        return {
          statusId:          5,   // Time Limit Exceeded (Judge0 convention)
          statusDescription: "Time Limit Exceeded",
          stdout:            result.stdout,
          stderr:            result.stderr,
          compileOutput:     "",
          time:              String(timeoutMs / 1000),
          memory:            null,
        };
      }

      // Non-zero exit → runtime error (Judge0 status 11)
      const accepted = result.exitCode === 0;
      return {
        statusId:          accepted ? 3 : 11,
        statusDescription: accepted ? "Accepted" : "Runtime Error",
        stdout:            result.stdout,
        stderr:            result.stderr,
        compileOutput:     "",
        time:              elapsedSec,
        memory:            null,  // Docker doesn't easily expose peak memory per run
      };
    },

    cleanup: () => cleanupDir(containerPath),
  };
}

/**
 * One-shot helper: create a session, run once, clean up.
 * Convenient for the raw-run (no problemId) path.
 */
export async function runInDocker(params: {
  sourceCode: string;
  language:   string;
  stdin:      string;
  timeoutMs?: number;
}): Promise<Judge0RunResult> {
  let session: DockerSession | null = null;
  try {
    session = await createDockerSession(params.sourceCode, params.language);
    return await session.run(params.stdin, params.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
  } finally {
    session?.cleanup();
  }
}
