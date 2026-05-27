import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import jwt from "jsonwebtoken";

/**
 * Derive a per-user rate-limit key.
 *
 * In a university environment all students may share a single public IP
 * (NAT / campus proxy).  Keying by IP would let one student exhaust the
 * quota for the entire class.  We extract the userId from the Bearer token
 * instead, falling back to the IP only when no valid token is present.
 */
function userKey(req: Request): string {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token   = auth.slice(7);
      const secret  = process.env.JWT_SECRET ?? "dev-secret";
      const payload = jwt.verify(token, secret) as { userId?: number };
      if (payload?.userId) return `user:${payload.userId}`;
    }
  } catch {
    // invalid / expired token — fall through to IP
  }
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

/**
 * AI mentor endpoints: max 10 requests per minute per user by default.
 * Prevents students from spamming hints during exams.
 *
 * Override with AI_RATE_LIMIT_PER_MIN for eval runs (e.g. set to 60).
 */
const AI_RATE_LIMIT_PER_MIN = Math.max(
  1,
  Number.parseInt(process.env.AI_RATE_LIMIT_PER_MIN ?? "10", 10) || 10,
);
export const aiLimiter = rateLimit({
  windowMs:       60_000,
  max:            AI_RATE_LIMIT_PER_MIN,
  keyGenerator:   userKey,
  standardHeaders: true,
  legacyHeaders:  false,
  message: { error: "Too many AI requests — please wait a minute before trying again." },
});

/**
 * Code execution endpoints: max 20 requests per minute per user.
 * Prevents run-loop abuse.
 */
export const executeLimiter = rateLimit({
  windowMs:       60_000,
  max:            20,
  keyGenerator:   userKey,
  standardHeaders: true,
  legacyHeaders:  false,
  message: { error: "Too many execution requests — please wait a minute before trying again." },
});
