/**
 * WebSocket base URL — mirrors the same-origin pattern used by apiBase.js.
 *
 * In production (Docker nginx) and on the cloud server (34.7.32.253 or any other IP),
 * nginx proxies /ws → backend, so we connect to the *same host* the page was loaded from.
 *
 * In local Vite dev, Vite proxies /ws → ws://localhost:5000 (see vite.config.js).
 *
 * Either way: no hardcoded IP, no hardcoded port.
 */
function buildWsBase() {
  const override = import.meta.env.VITE_WS_BASE_URL;
  if (typeof override === "string" && override.trim() !== "") {
    return override.trim().replace(/\/$/, "");
  }
  // Derive from page origin: http → ws, https → wss
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

export const WS_BASE = buildWsBase();

/** Returns a fully-qualified WebSocket URL for the given path, e.g. "/ws/terminal" */
export function wsUrl(path) {
  return `${WS_BASE}${path}`;
}
