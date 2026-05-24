/**
 * Judge0 `language_id` values (see Judge0 docs /languages).
 *
 * Default IDs match Judge0 CE v1.x (the standard self-hosted version):
 *   JavaScript = 63  (Node.js 12.14.0)
 *
 * If you are using Judge0 v2 / RapidAPI, Node.js is id 93.
 * Override per-language via environment variables:
 *   JUDGE0_JS_ID=93   JUDGE0_PY_ID=71   JUDGE0_JAVA_ID=62  etc.
 */

function envId(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MAP: Record<string, number> = {
  javascript: envId("JUDGE0_JS_ID",     63),
  js:         envId("JUDGE0_JS_ID",     63),
  python:     envId("JUDGE0_PY_ID",     71),
  py:         envId("JUDGE0_PY_ID",     71),
  java:       envId("JUDGE0_JAVA_ID",   62),
  cpp:        envId("JUDGE0_CPP_ID",    54),
  "c++":      envId("JUDGE0_CPP_ID",    54),
  c:          envId("JUDGE0_C_ID",      50),
  csharp:     envId("JUDGE0_CS_ID",     51),
  "c#":       envId("JUDGE0_CS_ID",     51),
};

export function resolveLanguageId(problemLanguage: string, override?: number): number {
  if (override != null && Number.isFinite(override)) {
    return override;
  }
  const key = problemLanguage.trim().toLowerCase();
  const id = MAP[key];
  if (id == null) {
    throw new Error(`Unsupported problem language "${problemLanguage}"; send languageId in the request body.`);
  }
  return id;
}
