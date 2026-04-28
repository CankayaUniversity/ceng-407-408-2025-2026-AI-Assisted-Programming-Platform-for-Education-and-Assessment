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
    include: { problem: { select: { id: true, title: true } } },
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


// ── GET /api/student/analytics ─────────────────────────────────────────────
// Returns rich analytics data for the authenticated student.
router.get("/analytics", async (req, res) => {
  const userId = req.auth!.userId;

  const [attempts, hints] = await Promise.all([
    prisma.submissionAttempt.findMany({
      where: { userId, mode: "tests" },
      include: { problem: { select: { id: true, title: true, difficulty: true, language: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.hintEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // ── Daily activity ────────────────────────────────────────────────────────
  const dayMap = new Map<string, { count: number; accepted: number }>();
  for (const a of attempts) {
    const day = a.createdAt.toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, { count: 0, accepted: 0 });
    const d = dayMap.get(day)!;
    d.count += 1;
    if (a.normalizedStatus === "accepted") d.accepted += 1;
  }
  const dailyActivity = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // ── Streak (consecutive days ending today or yesterday) ───────────────────
  let streak = 0;
  if (dailyActivity.length > 0) {
    const days = new Set(dailyActivity.map((d) => d.date));
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (days.has(key)) streak++;
      else if (i > 0) break;
    }
  }

  // ── Per-problem breakdown ─────────────────────────────────────────────────
  const problemMap = new Map<number, {
    problemId: number; title: string; difficulty: string | null;
    language: string; solved: boolean; attempts: number;
    attemptsToSolve: number | null; hintsUsed: number;
    errorProfile: Record<string, number>;
    firstSolvedAt: string | null;
    timeline: { date: string; status: string }[];
  }>();

  for (const a of attempts) {
    const pid = a.problemId!;
    if (!pid) continue;
    if (!problemMap.has(pid)) {
      problemMap.set(pid, {
        problemId: pid,
        title: a.problem?.title ?? `Problem #${pid}`,
        difficulty: a.problem?.difficulty ?? null,
        language: a.language,
        solved: false, attempts: 0, attemptsToSolve: null,
        hintsUsed: 0, errorProfile: {}, firstSolvedAt: null, timeline: [],
      });
    }
    const p = problemMap.get(pid)!;
    p.attempts += 1;
    p.timeline.push({ date: a.createdAt.toISOString().slice(0, 10), status: a.normalizedStatus });
    if (a.normalizedStatus === "accepted" && !p.solved) {
      p.solved = true;
      p.attemptsToSolve = p.attempts;
      p.firstSolvedAt = a.createdAt.toISOString();
    }
    if (a.normalizedStatus !== "accepted") {
      const key = a.normalizedStatus;
      p.errorProfile[key] = (p.errorProfile[key] ?? 0) + 1;
    }
  }

  // Attach hint counts
  for (const h of hints) {
    if (h.problemId && problemMap.has(h.problemId)) {
      problemMap.get(h.problemId)!.hintsUsed += 1;
    }
  }

  const perProblem = [...problemMap.values()].sort((a, b) => {
    if (a.solved !== b.solved) return a.solved ? -1 : 1;
    return (b.attemptsToSolve ?? b.attempts) - (a.attemptsToSolve ?? a.attempts);
  });

  // ── Global error profile ──────────────────────────────────────────────────
  const errorProfile: Record<string, number> = {};
  for (const a of attempts) {
    if (a.normalizedStatus !== "accepted") {
      errorProfile[a.normalizedStatus] = (errorProfile[a.normalizedStatus] ?? 0) + 1;
    }
  }

  // ── Language usage ────────────────────────────────────────────────────────
  const languageUsage: Record<string, number> = {};
  for (const a of attempts) {
    languageUsage[a.language] = (languageUsage[a.language] ?? 0) + 1;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const accepted = attempts.filter((a) => a.normalizedStatus === "accepted").length;
  const solved   = [...problemMap.values()].filter((p) => p.solved).length;

  // Learning trend: compare acceptance rate first-half vs second-half
  let learningTrend: "improving" | "declining" | "stable" = "stable";
  if (attempts.length >= 4) {
    const mid = Math.floor(attempts.length / 2);
    const rate = (arr: typeof attempts) =>
      arr.filter((a) => a.normalizedStatus === "accepted").length / arr.length;
    const r1 = rate(attempts.slice(0, mid));
    const r2 = rate(attempts.slice(mid));
    if (r2 > r1 + 0.05) learningTrend = "improving";
    else if (r2 < r1 - 0.05) learningTrend = "declining";
  }

  // ── Submission timeline (cumulative solved count per day) ─────────────────
  const solvedDays: { date: string; solved: number; total: number }[] = [];
  let cumSolved = 0;
  const solvedProblemsSet = new Set<number>();
  const dayAttemptsMap = new Map<string, { solved: number; total: number }>();
  for (const a of attempts) {
    const day = a.createdAt.toISOString().slice(0, 10);
    if (!dayAttemptsMap.has(day)) dayAttemptsMap.set(day, { solved: 0, total: 0 });
    dayAttemptsMap.get(day)!.total += 1;
    if (a.normalizedStatus === "accepted" && a.problemId && !solvedProblemsSet.has(a.problemId)) {
      solvedProblemsSet.add(a.problemId);
      dayAttemptsMap.get(day)!.solved += 1;
    }
  }
  let cumTotal = 0;
  for (const [date, v] of [...dayAttemptsMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    cumSolved += v.solved;
    cumTotal  += v.total;
    solvedDays.push({ date, solved: cumSolved, total: cumTotal });
  }

  res.json({
    data: {
      summary: {
        totalAttempts: attempts.length,
        acceptedAttempts: accepted,
        successRate: attempts.length > 0 ? Math.round((accepted / attempts.length) * 100) : 0,
        totalHints: hints.length,
        problemsSolved: solved,
        totalProblemsAttempted: problemMap.size,
        streak,
      },
      dailyActivity,
      submissionTimeline: solvedDays,
      perProblem,
      errorProfile,
      languageUsage,
      learningTrend,
    },
  });
});

export { router as studentRouter };
