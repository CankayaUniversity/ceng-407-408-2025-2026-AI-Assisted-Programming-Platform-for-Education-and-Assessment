import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/authTokens";
import { requireAuth } from "../middleware/requireAuth";
import { loginSchema, registerSchema, refreshTokenSchema } from "../lib/schemas";
import {
  sendVerificationEmail,
  sendApprovalEmail,
  sendPendingApprovalAlert,
} from "../lib/emailService";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Generate a 6-digit OTP and store it in VerificationCode (15 min expiry). */
async function issueOtp(userId: number): Promise<string> {
  const code = crypto.randomInt(100_000, 999_999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1_000); // 15 min

  // Invalidate any existing unused codes for this user
  await prisma.verificationCode.updateMany({
    where: { userId, used: false },
    data:  { used: true },
  });

  await prisma.verificationCode.create({
    data: { userId, code, expiresAt },
  });

  return code;
}

// ── POST /api/auth/register ────────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { email, password, name, role: roleName, classYear } = parsed.data;

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    res.status(503).json({ error: "Role not found; run database migrations and seed", role: roleName });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // If the existing account is stuck in pending_email, allow resending OTP
    if (existing.status === "pending_email") {
      const code = await issueOtp(existing.id);
      await sendVerificationEmail(email, existing.name, code).catch((err) =>
        console.error("[auth/register] resend email failed:", err.message),
      );
      res.status(200).json({
        requiresVerification: true,
        userId: existing.id,
        message: "A new verification code has been sent to your email.",
      });
      return;
    }
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // All new accounts start in pending_email — the OTP step activates them.
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      roleId:    role.id,
      status:    "pending_email",
      classYear: roleName === "student" ? (classYear ?? null) : null,
    },
    include: { role: true },
  });

  const code = await issueOtp(user.id);
  await sendVerificationEmail(email, name, code).catch((err) =>
    console.error("[auth/register] verification email failed:", err.message),
  );

  res.status(201).json({
    requiresVerification: true,
    userId: user.id,
    message: "Registration started. Please check your email for a 6-digit verification code.",
  });
});

// ── POST /api/auth/verify-email ───────────────────────────────────────────────

router.post("/verify-email", async (req, res) => {
  const { userId, code } = req.body as { userId?: number; code?: string };

  if (!userId || !code) {
    res.status(400).json({ error: "userId and code are required" });
    return;
  }

  const record = await prisma.verificationCode.findFirst({
    where: { userId, code, used: false },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    res.status(400).json({ error: "Invalid verification code" });
    return;
  }

  if (record.expiresAt < new Date()) {
    res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    return;
  }

  // Mark code as used
  await prisma.verificationCode.update({
    where: { id: record.id },
    data:  { used: true },
  });

  const user = await prisma.user.findUnique({
    where:   { id: userId },
    include: { role: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isTeacher = user.role.name === "teacher";

  if (isTeacher) {
    // Teachers wait for admin approval next
    await prisma.user.update({
      where: { id: userId },
      data:  { status: "pending_approval" },
    });

    // Notify all admin teachers
    const admins = await prisma.user.findMany({
      where: { isAdmin: true },
      select: { email: true },
    });
    await sendPendingApprovalAlert(
      admins.map((a) => a.email),
      user.name,
      user.email,
    ).catch((err) =>
      console.error("[auth/verify-email] admin alert email failed:", err.message),
    );

    res.json({
      requiresApproval: true,
      message:
        "Email verified! Your teacher account is now awaiting admin approval. You will receive an email once approved.",
    });
    return;
  }

  // Students: email verified → immediately active
  const activated = await prisma.user.update({
    where:   { id: userId },
    data:    { status: "active" },
    include: { role: true },
  });

  const payload      = { userId: activated.id, email: activated.email, role: activated.role.name, isAdmin: activated.isAdmin };
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res.json({
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    user: {
      id:    activated.id,
      email: activated.email,
      name:  activated.name,
      role:  activated.role.name,
    },
  });
});

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────

router.post("/resend-otp", async (req, res) => {
  const { userId } = req.body as { userId?: number };
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "pending_email") {
    res.status(400).json({ error: "No pending verification for this user" });
    return;
  }

  const code = await issueOtp(userId);
  await sendVerificationEmail(user.email, user.name, code).catch((err) =>
    console.error("[auth/resend-otp] email failed:", err.message),
  );

  res.json({ message: "A new verification code has been sent to your email." });
});

// ── POST /api/auth/login ───────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where:   { email },
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

  // Status gate
  if (user.status === "pending_email") {
    res.status(403).json({
      error: "Please verify your email before signing in.",
      status: "pending_email",
      userId: user.id,
    });
    return;
  }
  if (user.status === "pending_approval") {
    res.status(403).json({
      error: "Your teacher account is pending admin approval. You will be notified by email.",
      status: "pending_approval",
    });
    return;
  }
  if (user.status === "rejected") {
    res.status(403).json({
      error: "Your account registration was not approved. Please contact the administrator.",
      status: "rejected",
    });
    return;
  }

  const payload      = { userId: user.id, email: user.email, role: user.role.name, isAdmin: user.isAdmin };
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res.json({
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    user: {
      id:        user.id,
      email:     user.email,
      name:      user.name,
      role:      user.role.name,
      isAdmin:   user.isAdmin,
      classYear: user.classYear,
    },
  });
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────

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
      userId:  payload.userId,
      email:   payload.email,
      role:    payload.role,
      isAdmin: payload.isAdmin,
    });
    res.json({ accessToken, tokenType: "Bearer" });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req, res) => {
  const { userId } = req.auth!;
  const user = await prisma.user.findUnique({
    where:   { id: userId },
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
    isAdmin:   user.isAdmin,
    classYear: user.classYear,
    createdAt: user.createdAt,
  });
});

export { router as authRouter };
