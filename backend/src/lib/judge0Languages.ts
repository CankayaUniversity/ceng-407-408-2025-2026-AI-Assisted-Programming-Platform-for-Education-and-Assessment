/** Judge0 `language_id` values (see Judge0 docs /languages). */

const MAP: Record<string, number> = {
  javascript: 63,
  js: 63,
  python: 71,
  py: 71,
  java: 62,
  cpp: 54,
  "c++": 54,
  c: 50,
  csharp: 51,
  "c#": 51,
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
