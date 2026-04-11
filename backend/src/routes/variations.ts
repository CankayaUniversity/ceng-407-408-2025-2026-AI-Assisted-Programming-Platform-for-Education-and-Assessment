import { Router } from "express";
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
      title:       problem.title,
      description: problem.description,
      difficulty:  problem.difficulty,
      language:    problem.language,
      starterCode: problem.starterCode,
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
      status:          "pending",
      aiModel:         result.model,
      promptVersion:   "variation_v1",
    },
  });

  res.status(201).json({ data: variation });
});

// ── GET /api/variations?problemId=X ──────────────────────────────────────────
// List all pending variations for a problem (or all problems if no filter).

router.get("/", async (req, res) => {
  const problemId = req.query.problemId ? Number(req.query.problemId) : undefined;

  const variations = await prisma.problemVariation.findMany({
    where: {
      ...(problemId !== undefined ? { sourceProblemId: problemId } : {}),
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

  const variation = await prisma.problemVariation.findUnique({ where: { id } });
  if (!variation) {
    res.status(404).json({ error: "Variation not found" });
    return;
  }
  if (variation.status !== "pending") {
    res.status(409).json({ error: `Variation is already "${variation.status}"` });
    return;
  }

  // Promote to a real Problem, then mark approved — both in a transaction
  const [newProblem] = await prisma.$transaction([
    prisma.problem.create({
      data: {
        title:           variation.title,
        description:     variation.description,
        difficulty:      variation.difficulty,
        language:        variation.language,
        starterCode:     variation.starterCode,
        createdById:     req.auth!.userId,
        tags:            [],
        metadata:        {
          generatedFrom: variation.sourceProblemId,
          variationId:   variation.id,
          aiModel:       variation.aiModel,
        },
      },
    }),
    prisma.problemVariation.update({
      where: { id },
      data:  { status: "approved" },
    }),
  ]);

  res.json({ data: { newProblemId: newProblem.id, variation: { id, status: "approved" } } });
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
