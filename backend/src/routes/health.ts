import type { Request, Response } from "express";
import { checkDependenciesHealth } from "../services/healthDeps";

/**
 * Liveness: process is up (matches design doc “core remains up” split from deps).
 */
export function liveHandler(_req: Request, res: Response): void {
  res.json({ status: "ok", service: "api" });
}

/**
 * Readiness-style probe: includes DB, Judge0, and Ollama reachability (best-effort).
 */
export function readyHandler(_req: Request, res: Response): void {
  void checkDependenciesHealth()
    .then((dependencies) => {
      const degraded =
        !dependencies.database.ok || !dependencies.judge0.ok || !dependencies.ollama.ok;

      res.status(200).json({
        status: degraded ? "degraded" : "ok",
        service: "api",
        dependencies,
      });
    })
    .catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      res.status(503).json({
        status: "error",
        service: "api",
        error: message,
      });
    });
}
