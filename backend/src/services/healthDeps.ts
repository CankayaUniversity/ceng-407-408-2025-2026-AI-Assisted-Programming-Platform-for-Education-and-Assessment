import { prisma } from "../lib/prisma";

const PING_TIMEOUT_MS = 3000;

async function pingWithTimeout(url: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutPromise = new Promise<Response>((_resolve, reject) => {
    setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, PING_TIMEOUT_MS);
  });

  try {
    const fetchPromise = fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    const res = (await Promise.race([fetchPromise, timeoutPromise])) as Response;
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    return { ok: true, latencyMs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, latencyMs: Date.now() - start, error: msg };
  }
}

function ollamaTagsUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/tags`;
}

export type DependenciesHealth = {
  database: { ok: boolean; error?: string; latencyMs: number };
  ollama:   { ok: boolean; error?: string; latencyMs: number };
};

export async function checkDependenciesHealth(): Promise<DependenciesHealth> {
  const startDb = Date.now();
  let database: DependenciesHealth["database"];
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    database = { ok: true, latencyMs: Date.now() - startDb };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    database = { ok: false, error: msg, latencyMs: Date.now() - startDb };
  }

  const ollama = await pingWithTimeout(ollamaTagsUrl());

  return { database, ollama };
}
