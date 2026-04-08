import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth);

router.get("/exam-mode", async (_req, res) => {
  const flag = await prisma.systemFlag.findUnique({
    where: { key: "exam_mode_enabled" },
  });

  res.json({
    data: {
      key: "exam_mode_enabled",
      enabled: Boolean(flag?.value),
    },
  });
});

router.patch("/exam-mode", requireRole("admin", "teacher"), async (req, res) => {
  const enabled = Boolean((req.body as { enabled?: unknown }).enabled);

  const flag = await prisma.systemFlag.upsert({
    where: { key: "exam_mode_enabled" },
    update: { value: enabled },
    create: { key: "exam_mode_enabled", value: enabled },
  });

  res.json({
    data: {
      key: flag.key,
      enabled: Boolean(flag.value),
      updatedAt: flag.updatedAt,
    },
  });
});

export { router as adminRouter };
