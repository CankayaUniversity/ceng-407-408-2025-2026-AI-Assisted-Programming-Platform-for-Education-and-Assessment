import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.use(requireAuth);

function parseOptionalId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

router.get("/history", async (req, res) => {
  const problemId = parseOptionalId(
    typeof req.query.problemId === "string" ? req.query.problemId : undefined,
  );

  const submissions = await prisma.submission.findMany({
    where: {
      userId: req.auth!.userId,
      ...(problemId !== undefined ? { problemId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  res.json({ data: submissions });
});

router.get("/history/ai", async (req, res) => {
  const problemId = parseOptionalId(
    typeof req.query.problemId === "string" ? req.query.problemId : undefined,
  );

  const aiLogs = await prisma.aiLog.findMany({
    where: {
      userId: req.auth!.userId,
      ...(problemId !== undefined ? { problemId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  res.json({ data: aiLogs });
});

export { router as studentRouter };
