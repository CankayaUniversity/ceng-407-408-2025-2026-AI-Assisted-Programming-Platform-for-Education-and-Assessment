import { Router } from "express";
import { Prisma, VariationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateVariation, type VariationType } from "../services/variationService";
import { variationGenerateSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);
router.use(requireRole("teacher", "admin"));

// ── POST /api/variations/generate ─────────────────────────────────────────────
// Generate an AI variation of an existing problem and persist it as "pending".

router.post("/generate", async (req, res) => {
  const parsed = variationGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { problemId, type } = parsed.data;

  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  const result = await generateVariation(
    {
      title:             problem.title,
      description:       problem.description,
      difficulty:        problem.difficulty,
      language:          problem.language,
      starterCode:       problem.starterCode,
      referenceSolution: problem.referenceSolution,
    },
    type as VariationType,
  );

  if (!result.success) {
    res.status(503).json({ error: "AI generation failed", detail: result.error });
    return;
  }

  const variation = await prisma.problemVariation.create({
    data: {
      sourceProblemId: problemId,
      createdById:     req.auth!.userId,
      title:           result.variation.title,
      description:     result.variation.description,
      difficulty:      result.variation.difficulty,
      language:        result.variation.language,
      starterCode:     result.variation.starterCode || null,
      status:          VariationStatus.pending,
      aiModel:         result.model,
      // Bump to v3 to mark this row as having gone through runtime
      // example verification — useful for analytics and the report.
      promptVersion:   "variation_v3",
    },
  });

  res.status(201).json({
    data: variation,
    verification: {
      total:    result.verification.total,
      verified: result.verification.verified,
      stripped: result.verification.stripped,
      skipped:  result.verification.skipped,
      skipReason: result.verification.skipReason,
    },
  });
});

// ── GET /api/variations?problemId=X&status=Y ─────────────────────────────────
// List variations for a problem (or all problems if no filter).
// Defaults to status=pending so teachers don't see rejected/approved items
// mixed into their review queue. Pass status=all to retrieve everything.

router.get("/", async (req, res) => {
  const problemId = req.query.problemId ? Number(req.query.problemId) : undefined;
  const status    = typeof req.query.status === "string" ? req.query.status : "pending";

  const ALLOWED_STATUSES: VariationStatus[] = [
    VariationStatus.pending,
    VariationStatus.approved,
    VariationStatus.rejected,
  ];
  const requestedStatus = (ALLOWED_STATUSES as string[]).includes(status)
    ? (status as VariationStatus)
    : VariationStatus.pending;
  const statusFilter: Prisma.ProblemVariationWhereInput =
    status === "all" ? {} : { status: requestedStatus };

  const variations = await prisma.problemVariation.findMany({
    where: {
      ...(problemId !== undefined ? { sourceProblemId: problemId } : {}),
      ...statusFilter,
    },
    orderBy: { createdAt: "desc" },
    include: {
      sourceProblem: { select: { id: true, title: true } },
      createdBy:     { select: { id: true, name: true } },
    },
  });

  res.json({ data: variations });
});

// ── PATCH /api/variations/:id/approve ────────────────────────────────────────
// Approve a variation: mark it approved and promote it to a full Problem.

router.patch("/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid variation id" });
    return;
  }

  const variation = await prisma.problemVariation.findUnique({
    where: { id },
    include: { sourceProblem: { select: { tags: true } } },
  });
  if (!variation) {
    res.status(404).json({ error: "Variation not found" });
    return;
  }
  if (variation.status !== "pending") {
    res.status(409).json({ error: `Variation is already "${variation.status}"` });
    return;
  }

  // Promote to a real Problem, then mark approved — both in a transaction.
  // We pass `updateMany({ where: { id, status: "pending" }})` so a concurrent
  // approve from another tab cannot create a duplicate Problem; the second
  // call will hit count=0 and we'll roll back.
  const inheritedTags = Array.isArray(variation.sourceProblem?.tags)
    ? variation.sourceProblem.tags
    : [];

  let newProblem;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.problemVariation.updateMany({
        where: { id, status: VariationStatus.pending },
        data:  { status: VariationStatus.approved },
      });
      if (updated.count === 0) {
        // Another request already approved/rejected this variation between
        // our findUnique and updateMany. Abort cleanly.
        throw new Error("RACE_LOST");
      }
      return tx.problem.create({
        data: {
          title:           variation.title,
          description:     variation.description,
          difficulty:      variation.difficulty,
          language:        variation.language,
          starterCode:     variation.starterCode,
          createdById:     req.auth!.userId,
          // Inherit tags from the source problem so the variation stays in
          // the same logical category instead of becoming orphaned.
          tags:            inheritedTags,
          metadata:        {
            generatedFrom: variation.sourceProblemId,
            variationId:   variation.id,
            aiModel:       variation.aiModel,
          },
        },
      });
    });
    newProblem = result;
  } catch (e) {
    if (e instanceof Error && e.message === "RACE_LOST") {
      res.status(409).json({ error: "Variation was already approved or rejected by another request" });
      return;
    }
    throw e;
  }

  // AI-generated variations contain no test cases — the teacher must add them
  // via the problem editor before the problem can be used for grading.
  res.json({
    data: {
      newProblemId: newProblem.id,
      variation:    { id, status: "approved" },
    },
    warning:
      "The new problem has no test cases. Add test cases in the problem editor before assigning it to students.",
  });
});

// ── DELETE /api/variations/:id ────────────────────────────────────────────────
// Reject (soft-delete by setting status=rejected) a variation.

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid variation id" });
    return;
  }

  const variation = await prisma.problemVariation.findUnique({ where: { id } });
  if (!variation) {
    res.status(404).json({ error: "Variation not found" });
    return;
  }

  await prisma.problemVariation.update({
    where: { id },
    data:  { status: "rejected" },
  });

  res.json({ data: { id, status: "rejected" } });
});

export { router as variationsRouter };
