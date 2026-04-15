/**
 * API origin for fetch().
 * - Empty: same origin — Docker nginx proxies /api → backend; Vite dev proxies /api (see vite.config.js).
 * - Full URL: direct backend (optional override).
 */
const raw = import.meta.env.VITE_API_BASE_URL;
export const API_BASE =
  typeof raw === "string" && raw.trim() !== "" ? raw.trim().replace(/\/$/, "") : "";
