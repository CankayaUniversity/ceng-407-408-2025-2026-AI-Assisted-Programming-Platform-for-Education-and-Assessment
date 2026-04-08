import type { RequestHandler } from "express";

export function requireRole(...allowedRoles: string[]): RequestHandler {
  const normalizedRoles = allowedRoles.map((role) => role.trim().toLowerCase());

  return (req, res, next) => {
    const role = req.auth?.role?.trim().toLowerCase();
    if (!role) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!normalizedRoles.includes(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
