import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { examModeSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);

// Helper: parse the SystemFlag value which may be legacy boolean or new { enabled, groupIds }
function parseExamFlag(raw: unknown): { enabled: boolean; groupIds: number[] } {
  if (typeof raw === "boolean") return { enabled: raw, groupIds: [] };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      enabled:  Boolean(obj.enabled),
      groupIds: Array.isArray(obj.groupIds) ? (obj.groupIds as number[]) : [],
    };
  }
  return { enabled: false, groupIds: [] };
}

router.get("/exam-mode", async (_req, res) => {
  const flag = await prisma.systemFlag.findUnique({
    where: { key: "exam_mode_enabled" },
  });
  const { enabled, groupIds } = parseExamFlag(flag?.value);
  res.json({ data: { key: "exam_mode_enabled", enabled, groupIds } });
});

router.patch("/exam-mode", requireRole("admin", "teacher"), async (req, res) => {
  const parsed = examModeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { enabled, groupIds } = parsed.data;

  const flag = await prisma.systemFlag.upsert({
    where:  { key: "exam_mode_enabled" },
    update: { value: { enabled, groupIds } },
    create: { key: "exam_mode_enabled", value: { enabled, groupIds } },
  });

  const result = parseExamFlag(flag.value);
  res.json({
    data: { key: flag.key, enabled: result.enabled, groupIds: result.groupIds, updatedAt: flag.updatedAt },
  });
});

export { router as adminRouter };
