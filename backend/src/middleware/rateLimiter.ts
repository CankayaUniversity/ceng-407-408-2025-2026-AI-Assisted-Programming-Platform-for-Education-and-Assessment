import rateLimit from "express-rate-limit";

/**
 * AI mentor endpoints: max 10 requests per minute per IP.
 * Prevents students from spamming hints during exams.
 */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests — please wait a minute before trying again." },
});

/**
 * Code execution endpoints: max 20 requests per minute per IP.
 * Prevents run-loop abuse.
 */
export const executeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many execution requests — please wait a minute before trying again." },
});
