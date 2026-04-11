import jwt from "jsonwebtoken";
import type { JwtPayload } from "../types/auth";

const ACCESS_EXPIRES_IN  = "60m";
const REFRESH_EXPIRES_IN = "7d";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return "development-only-insecure-secret";
}

function getRefreshSecret(): string {
  const secret = process.env.REFRESH_SECRET ?? process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("REFRESH_SECRET must be set in production");
  }
  return "development-only-insecure-refresh-secret";
}

function validatePayloadShape(decoded: unknown): JwtPayload {
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("userId" in decoded) ||
    !("email" in decoded) ||
    !("role" in decoded)
  ) {
    throw new Error("Invalid token payload");
  }
  const { userId, email, role } = decoded as Record<string, unknown>;
  if (typeof userId !== "number" || typeof email !== "string" || typeof role !== "string") {
    throw new Error("Invalid token fields");
  }
  return { userId, email, role };
}

// ── Access token (60 min) ─────────────────────────────────────────────────────

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: ACCESS_EXPIRES_IN });
}

export function verifyAccessToken(token: string): JwtPayload {
  return validatePayloadShape(jwt.verify(token, getSecret()));
}

// ── Refresh token (7 days) ────────────────────────────────────────────────────

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: REFRESH_EXPIRES_IN });
}

export function verifyRefreshToken(token: string): JwtPayload {
  return validatePayloadShape(jwt.verify(token, getRefreshSecret()));
}
