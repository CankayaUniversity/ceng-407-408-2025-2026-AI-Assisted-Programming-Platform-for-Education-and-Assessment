import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// ── ANSI color helpers ────────────────────────────────────────────────────────
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET  = "\x1b[0m";

// ────────────────────────────────────────────────────────────────────────────
// useTerminalWriter
//
// Returns a ref whose `.current` will be set to `{ write(text), clear() }`
// once the InteractiveTerminal mounts and calls `onReady`.
// Parent components hold this ref and call `ref.current.write(...)` imperatively.
// ────────────────────────────────────────────────────────────────────────────
export function useTerminalWriter() {
  const writerRef = useRef(null);
  return writerRef;
}

// ────────────────────────────────────────────────────────────────────────────
// InteractiveTerminal
//
// Props:
//  - wsUrl   : string | null  — if provided, a WebSocket is opened to this URL
//  - onReady : ({ write(text), clear() }) => void  — called once on mount
// ────────────────────────────────────────────────────────────────────────────
export default function InteractiveTerminal({ wsUrl, onReady }) {
  const containerRef = useRef(null);
  // keep refs so cleanup always has the latest instances
  const termRef = useRef(null);
  const fitRef  = useRef(null);
  const wsRef   = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── Initialize terminal ────────────────────────────────────────────────
    const terminal = new Terminal({
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor:     "#94a3b8",
      },
      fontSize:    13,
      fontFamily:  "monospace",
      cursorBlink: true,
      convertEol:  true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    termRef.current = terminal;
    fitRef.current  = fitAddon;

    // ── Expose write / clear to parent ────────────────────────────────────
    const api = {
      write: (text) => terminal.write(text),
      clear: ()     => terminal.clear(),
    };

    if (typeof onReady === "function") {
      onReady(api);
    }

    // ── Resize observer ───────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch (_) { /* ignore during unmount */ }
    });
    resizeObserver.observe(containerRef.current);

    // ── Optional WebSocket ────────────────────────────────────────────────
    if (wsUrl) {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          terminal.write(event.data);
          return;
        }

        switch (msg.type) {
          case "data":
            terminal.write(msg.text ?? "");
            break;

          case "done": {
            const status = msg.status ?? "Done";
            const time   = msg.time   ?? 0;
            terminal.write(`\r\n${GREEN}\u2713 ${status} \u2014 ${time}ms${RESET}\r\n`);
            break;
          }

          case "error": {
            const message = msg.message ?? "Unknown error";
            terminal.write(`\r\n${RED}\u2717 ${message}${RESET}\r\n`);
            break;
          }

          default:
            // ignore unknown message types
            break;
        }
      };

      ws.onerror = () => {
        terminal.write(`\r\n${RED}WebSocket connection error.${RESET}\r\n`);
      };

      ws.onclose = (event) => {
        if (!event.wasClean) {
          terminal.write(`\r\n${YELLOW}Connection closed unexpectedly (code ${event.code}).${RESET}\r\n`);
        }
      };
    }

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      resizeObserver.disconnect();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      terminal.dispose();
      termRef.current = null;
      fitRef.current  = null;
    };
    // wsUrl is intentionally listed — reconnect when the URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
