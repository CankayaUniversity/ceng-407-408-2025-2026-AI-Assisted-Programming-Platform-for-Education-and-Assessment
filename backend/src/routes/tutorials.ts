/**
 * Tutorials routes.
 *
 * GET /api/tutorials/:tag/:language
 *   Returns the cached AI-generated tutorial for a tag+language pair.
 *   404 → not yet generated (still in progress or never triggered).
 */

import { Router, type Request, type Response } from "express";
import { prisma }      from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

router.get("/:tag/:language", async (req: Request, res: Response) => {
  const { tag, language } = req.params;

  if (!tag?.trim() || !language?.trim()) {
    res.status(400).json({ error: "tag and language are required" });
    return;
  }

  const tutorial = await prisma.tutorial.findUnique({
    where: { tag_language: { tag, language } },
  });

  if (!tutorial) {
    res.status(404).json({ error: "Tutorial not yet available" });
    return;
  }

  res.json({ success: true, data: tutorial });
});

export { router as tutorialsRouter };
