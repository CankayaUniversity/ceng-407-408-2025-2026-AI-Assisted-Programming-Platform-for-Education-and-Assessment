import type { WebSocket } from "ws";
import { verifyAccessToken } from "../lib/authTokens";
import { runInJudge0 } from "../services/judge0";
import { resolveLanguageId } from "../lib/judge0Languages";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WsRunMessage {
  type: "run";
  token: string;
  language: string;
  code: string;
  stdin?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(ws: WebSocket, obj: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * handleTerminalConnection
 *
 * Attached to each new WebSocket upgrade for the /ws/terminal endpoint.
 * Waits for a single "run" message, authenticates, submits to Judge0, then
 * streams the result back chunk-by-chunk to simulate real-time output.
 */
export async function handleTerminalConnection(ws: WebSocket): Promise<void> {
  ws.once("message", async (raw) => {
    let msg: WsRunMessage;

    // ── 1. Parse incoming message ────────────────────────────────────────────
    try {
      msg = JSON.parse(raw.toString()) as WsRunMessage;
    } catch {
      send(ws, { type: "error", message: "Invalid JSON payload" });
      ws.close();
      return;
    }

    if (msg.type !== "run") {
      send(ws, { type: "error", message: `Expected message type "run", got "${msg.type}"` });
      ws.close();
      return;
    }

    // ── 2. Authenticate ──────────────────────────────────────────────────────
    try {
      verifyAccessToken(msg.token);
    } catch {
      send(ws, { type: "error", message: "Unauthorized" });
      ws.close();
      return;
    }

    // ── 3. Resolve language → Judge0 language ID ─────────────────────────────
    let languageId: number;
    try {
      languageId = resolveLanguageId(msg.language);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(ws, { type: "error", message });
      ws.close();
      return;
    }

    // ── 4. Execute via Judge0 ────────────────────────────────────────────────
    try {
      const result = await runInJudge0({
        sourceCode: msg.code,
        languageId,
        stdin: msg.stdin ?? "",
      });

      // ── 5. Stream stdout in small chunks (~4 chars each, 10 ms apart) ──────
      const stdout = result.stdout ?? "";
      const CHUNK  = 4;

      for (let i = 0; i < stdout.length; i += CHUNK) {
        const chunk = stdout.slice(i, i + CHUNK);
        send(ws, { type: "data", text: chunk });
        await delay(10);
      }

      // ── 6. Append stderr (if any) ────────────────────────────────────────
      if (result.stderr) {
        send(ws, {
          type: "data",
          text: "\r\n\x1b[31m" + result.stderr + "\x1b[0m",
        });
      }

      // Also surface compile errors the same way when there is no stderr
      if (!result.stderr && result.compileOutput) {
        send(ws, {
          type: "data",
          text: "\r\n\x1b[31m" + result.compileOutput + "\x1b[0m",
        });
      }

      // ── 7. Send "done" summary ───────────────────────────────────────────
      //   result.time is string | null (e.g. "0.042"), convert to ms integer
      const execTimeMs = result.time != null ? Math.round(parseFloat(result.time) * 1000) : 0;

      send(ws, {
        type:   "done",
        status: result.statusDescription ?? "Finished",
        time:   execTimeMs,
        memory: result.memory ?? 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(ws, { type: "error", message });
      ws.close();
    }
  });
}
