import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/authTokens";
import { requireAuth } from "../middleware/requireAuth";
import { loginSchema, registerSchema, refreshTokenSchema } from "../lib/schemas";

const router = Router();

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { email, password, name, role: roleName } = parsed.data;

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

  const payload = { userId: user.id, email: user.email, role: user.role.name };
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res.status(201).json({
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    user: {
      id:    user.id,
      email: user.email,
      name:  user.name,
      role:  user.role.name,
    },
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

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

  const payload = { userId: user.id, email: user.email, role: user.role.name };
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res.json({
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    user: {
      id:    user.id,
      email: user.email,
      name:  user.name,
      role:  user.role.name,
    },
  });
});

router.post("/refresh", (req, res) => {
  const parsed = refreshTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { refreshToken } = parsed.data;

  try {
    const payload     = verifyRefreshToken(refreshToken);
    const accessToken = signAccessToken({
      userId: payload.userId,
      email:  payload.email,
      role:   payload.role,
    });
    res.json({ accessToken, tokenType: "Bearer" });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
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
    id:        user.id,
    email:     user.email,
    name:      user.name,
    role:      user.role.name,
    createdAt: user.createdAt,
  });
});

export { router as authRouter };
