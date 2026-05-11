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
export default function InteractiveTerminal({ wsUrl, onReady, onRunResult }) {
  const containerRef  = useRef(null);
  const termRef       = useRef(null);
  const wsRef         = useRef(null);
  const inputBuf      = useRef("");          // current line being typed
  const outputBuf     = useRef("");          // accumulated stdout for mentor context
  const isRunning     = useRef(false);
  const onDoneRef     = useRef(null);
  const onRunResultRef = useRef(onRunResult);
  const unmounted     = useRef(false);

  // Keep the ref in sync with the prop without re-running the effect
  onRunResultRef.current = onRunResult;

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
    try { fitAddon.fit(); } catch { /* ignore if container has zero dimensions at mount */ }
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
            // Buffer for mentor context (cap at 2 KB to stay within prompt limits)
            if (outputBuf.current.length < 2_000) {
              outputBuf.current += msg.data;
            }
            // Replace bare \n with \r\n so xterm renders correctly
            term.write(msg.data.replace(/\r?\n/g, "\r\n"));
          } else if (msg.type === "done") {
            isRunning.current = false;
            const color = msg.exitCode === 0 ? "\x1b[32m" : "\x1b[31m";
            term.write(`\r\n${color}[exited ${msg.exitCode}]\x1b[0m\r\n`);
            // Notify parent with collected output so AI mentor gets execution context
            onRunResultRef.current?.({
              exitCode: msg.exitCode,
              stdout:   outputBuf.current,
              stderr:   null,
            });
            outputBuf.current = "";
            onDoneRef.current?.();
            onDoneRef.current = null;
          } else if (msg.type === "error") {
            isRunning.current = false;
            term.write(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m\r\n`);
            onRunResultRef.current?.({
              exitCode: -1,
              stdout:   outputBuf.current,
              stderr:   msg.message,
            });
            outputBuf.current = "";
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
        // Ctrl+C — kill process
        term.write("^C\r\n");
        ws.send(JSON.stringify({ type: "kill" }));
        isRunning.current = false;
        onDoneRef.current?.();
        onDoneRef.current = null;
      } else if (data === "\x04") {
        // Ctrl+D — flush any buffered (not-yet-sent) line, then close stdin.
        // Without the flush, the last typed line would be lost if the user
        // pressed Ctrl+D without pressing Enter first.
        if (inputBuf.current.length > 0) {
          const pending = inputBuf.current;
          inputBuf.current = "";
          term.write("\r\n");
          ws.send(JSON.stringify({ type: "input", data: pending + "\n" }));
        }
        term.write("^D\r\n");
        ws.send(JSON.stringify({ type: "eof" }));
      } else if (data.charCodeAt(0) >= 32) {
        // Printable character — echo and buffer
        inputBuf.current += data;
        term.write(data);
      }
    });

    // ── API exposed to parent ─────────────────────────────────────────────
    // Only register the API once the WebSocket URL is known so the parent
    // never holds a writer that will immediately fail on run().
    if (wsUrl) onReady?.({
      write: (text) => term.write(text),

      clear: () => term.reset(),

      run: (language, code, token, onDone) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          term.write("\x1b[31m[Terminal not connected — retrying]\x1b[0m\r\n");
          setTimeout(() => onDone?.(), 500);
          return;
        }
        inputBuf.current  = "";
        outputBuf.current = "";   // reset output buffer for new run
        isRunning.current = true;
        onDoneRef.current = onDone ?? null;
        term.reset();
        term.write(`\x1b[33m▶ Running (${language})…\x1b[0m\r\n`);
        term.write(`\x1b[90m[Type input + Enter  •  Ctrl+C to stop  •  Ctrl+D for EOF]\x1b[0m\r\n\r\n`);
        ws.send(JSON.stringify({ type: "run", token, language, code }));
        // ── Auto-focus so keystrokes go to the terminal immediately ──────
        // Without this the code editor keeps focus and user input is lost.
        term.focus();
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      },

      kill: () => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "kill" }));
        }
        isRunning.current = false;
        // Report whatever was collected before kill — lets mentor know the partial output
        if (outputBuf.current) {
          onRunResultRef.current?.({ exitCode: -1, stdout: outputBuf.current, stderr: "killed", killed: true });
          outputBuf.current = "";
        }
        onDoneRef.current?.();
        onDoneRef.current = null;
      },

      // Send EOF (Ctrl+D) — closes stdin so programs that read until EOF can finish.
      // Flushes any buffered (not-yet-Enter'd) input first.
      sendEof: () => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (inputBuf.current.length > 0) {
          const pending = inputBuf.current;
          inputBuf.current = "";
          termRef.current?.write("\r\n");
          ws.send(JSON.stringify({ type: "input", data: pending + "\n" }));
        }
        termRef.current?.write("^D\r\n");
        ws.send(JSON.stringify({ type: "eof" }));
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
