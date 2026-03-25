/**
 * Minimal API smoke test (no frontend). Run after: docker compose up + seed.
 * Usage: node scripts/smoke-test.mjs
 * Env: API_BASE_URL (default http://localhost:5000)
 */

const base = (process.env.API_BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");

async function request(path, options = {}) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`Smoke test against ${base}\n`);

  const live = await request("/health");
  if (!live.res.ok || live.body?.status !== "ok") {
    fail(`/health expected { status: ok }, got ${live.res.status} ${JSON.stringify(live.body)}`);
  }
  console.log("OK  GET /health");

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "student1@demo.com",
      password: "123456",
    }),
  });
  if (!login.res.ok || !login.body?.accessToken) {
    fail(
      `Login failed (${login.res.status}). Run seed: npm run db:seed — ${JSON.stringify(login.body)}`,
    );
  }
  const token = login.body.accessToken;
  console.log("OK  POST /api/auth/login");

  const problems = await request("/api/problems", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!problems.res.ok || !Array.isArray(problems.body?.data)) {
    fail(`GET /api/problems failed: ${problems.res.status} ${JSON.stringify(problems.body)}`);
  }
  console.log(`OK  GET /api/problems (${problems.body.data.length} items)`);

  const ready = await request("/api/health");
  if (!ready.res.ok) {
    fail(`/api/health failed: ${ready.res.status}`);
  }
  const deps = ready.body?.dependencies;
  console.log(
    `OK  GET /api/health (status=${ready.body?.status} db=${deps?.database?.ok} judge0=${deps?.judge0?.ok} ollama=${deps?.ollama?.ok})`,
  );

  if (deps && (!deps.judge0?.ok || !deps.ollama?.ok)) {
    console.log(
      "\nNote: Judge0 or Ollama reported unreachable — execute/AI may fail until those services are up and JUDGE0_URL is correct.",
    );
  }

  console.log("\nAll smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
