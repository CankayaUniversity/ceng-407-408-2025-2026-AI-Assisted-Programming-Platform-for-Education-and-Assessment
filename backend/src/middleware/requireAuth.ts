import type { RequestHandler } from "express";
import { verifyAccessToken } from "../lib/authTokens";

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  try {
    req.auth = verifyAccessToken(header.slice("Bearer ".length).trim());
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
