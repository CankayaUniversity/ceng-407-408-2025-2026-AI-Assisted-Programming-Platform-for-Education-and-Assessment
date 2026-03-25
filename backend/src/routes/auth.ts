import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/authTokens";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

const ALLOWED_REGISTER_ROLES = new Set(["student", "teacher"]);

router.post("/register", async (req, res) => {
  const body = req.body as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  };

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const roleName = typeof body.role === "string" ? body.role.trim().toLowerCase() : "student";

  if (!email || !password || !name) {
    res.status(400).json({ error: "email, password, and name are required" });
    return;
  }
  if (!ALLOWED_REGISTER_ROLES.has(roleName)) {
    res.status(400).json({ error: "role must be student or teacher" });
    return;
  }

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    res.status(503).json({
      error: "Role not found; run database migrations and seed",
      role: roleName,
    });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      roleId: role.id,
    },
    include: { role: true },
  });

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role.name,
  });

  res.status(201).json({
    accessToken,
    tokenType: "Bearer",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
    },
  });
});

router.post("/login", async (req, res) => {
  const body = req.body as { email?: string; password?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role.name,
  });

  res.json({
    accessToken,
    tokenType: "Bearer",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
    },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const { userId } = req.auth!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    createdAt: user.createdAt,
  });
});

export { router as authRouter };
