import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/**
 * Interactive xterm.js terminal.
 *
 * - Connects a persistent WebSocket to wsUrl.
 * - Exposes { write, clear, run(language, code, token, onDone), kill } via onReady.
 * - User keystrokes are locally echoed and sent to the backend process over WS.
 * - Enter sends the buffered line to process stdin.
 * - Ctrl+C sends a kill message.
 */
export default function InteractiveTerminal({ wsUrl, onReady }) {
  const containerRef  = useRef(null);
  const termRef       = useRef(null);
  const wsRef         = useRef(null);
  const inputBuf      = useRef("");          // current line being typed
  const isRunning     = useRef(false);
  const onDoneRef     = useRef(null);
  const unmounted     = useRef(false);

  useEffect(() => {
    unmounted.current = false;

    // ── Create terminal ───────────────────────────────────────────────────
    const term = new Terminal({
      theme:       { background: "#0f172a", foreground: "#e2e8f0", cursor: "#94a3b8", cursorAccent: "#0f172a" },
      fontSize:    13,
      fontFamily:  '"Fira Mono", "Cascadia Code", monospace',
      cursorBlink: true,
      convertEol:  false,         // we handle \r\n ourselves
      scrollback:  2000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    // ── WebSocket ─────────────────────────────────────────────────────────
    let reconnectTimer = null;

    function connect() {
      if (unmounted.current || !wsUrl) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            // Replace bare \n with \r\n so xterm renders correctly
            term.write(msg.data.replace(/\r?\n/g, "\r\n"));
          } else if (msg.type === "done") {
            isRunning.current = false;
            const color = msg.exitCode === 0 ? "\x1b[32m" : "\x1b[31m";
            term.write(`\r\n${color}[exited ${msg.exitCode}]\x1b[0m\r\n`);
            onDoneRef.current?.();
            onDoneRef.current = null;
          } else if (msg.type === "error") {
            isRunning.current = false;
            term.write(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m\r\n`);
            onDoneRef.current?.();
            onDoneRef.current = null;
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!unmounted.current) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    // ── Keyboard input ────────────────────────────────────────────────────
    term.onData((data) => {
      const ws = wsRef.current;
      if (!isRunning.current || !ws || ws.readyState !== WebSocket.OPEN) return;

      if (data === "\r") {
        // Enter — send buffered line to process stdin
        const line = inputBuf.current;
        inputBuf.current = "";
        term.write("\r\n");
        ws.send(JSON.stringify({ type: "input", data: line + "\n" }));
      } else if (data === "\x7f" || data === "\b") {
        // Backspace
        if (inputBuf.current.length > 0) {
          inputBuf.current = inputBuf.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data === "\x03") {
        // Ctrl+C
        term.write("^C\r\n");
        ws.send(JSON.stringify({ type: "kill" }));
        isRunning.current = false;
        onDoneRef.current?.();
        onDoneRef.current = null;
      } else if (data.charCodeAt(0) >= 32) {
        // Printable character — echo and buffer
        inputBuf.current += data;
        term.write(data);
      }
    });

    // ── API exposed to parent ─────────────────────────────────────────────
    onReady?.({
      write: (text) => term.write(text),

      clear: () => term.reset(),

      run: (language, code, token, onDone) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          term.write("\x1b[31m[Terminal not connected — retrying]\x1b[0m\r\n");
          // Try once more after reconnect
          setTimeout(() => onDone?.(), 500);
          return;
        }
        inputBuf.current  = "";
        isRunning.current = true;
        onDoneRef.current = onDone ?? null;
        term.reset();
        term.write(`\x1b[33m▶ Running (${language})…\x1b[0m\r\n`);
        ws.send(JSON.stringify({ type: "run", token, language, code }));
      },

      kill: () => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "kill" }));
        }
        isRunning.current = false;
        onDoneRef.current?.();
        onDoneRef.current = null;
      },
    });

    // ── Resize observer ───────────────────────────────────────────────────
    const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch { /* ignore */ } });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      unmounted.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ro.disconnect();
      wsRef.current?.close();
      term.dispose();
    };
  // wsUrl intentionally in deps — reconnect when URL changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
