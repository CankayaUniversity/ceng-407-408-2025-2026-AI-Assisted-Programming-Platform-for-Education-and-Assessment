import jwt from "jsonwebtoken";
import type { JwtPayload } from "../types/auth";

const JWT_EXPIRES_IN = "60m";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return "development-only-insecure-secret";
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getSecret());
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
