import { API_BASE } from "../apiBase";

/**
 * Typed fetch wrapper used throughout the app.
 * Throws on non-2xx responses with the server's error message.
 *
 * @param {string} path      - e.g. "/api/auth/login"
 * @param {object} options   - standard fetch options + optional `timeoutMs`
 * @returns {Promise<any>}   - parsed JSON body
 */
export async function api(path, options = {}) {
  const { timeoutMs = 60_000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(fetchOptions.headers || {}),
      },
    });
    const raw = await res.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = { raw };
    }
    if (!res.ok) {
      throw new Error(body?.error || body?.detail || `HTTP ${res.status}`);
    }
    return body;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience wrapper that automatically injects the Bearer token.
 *
 * @param {string} token
 * @returns {(path: string, options?: object) => Promise<any>}
 */
export function authedApi(token) {
  return (path, options = {}) =>
    api(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
}
