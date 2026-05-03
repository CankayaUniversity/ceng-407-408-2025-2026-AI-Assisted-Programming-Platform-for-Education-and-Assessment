/**
 * Tutorials routes.
 *
 * GET /api/tutorials/:tag/:language
 *   Serves pre-scraped tutorial JSON files from src/data/tutorials/<language>/<tag>.json
 *   404 → file not found for that tag+language combination.
 */

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth";
import * as fs   from "fs";
import * as path from "path";

const router = Router();
router.use(requireAuth);

// Resolve to backend/src/data/tutorials/
// __dirname is available in CommonJS without import.meta
const DATA_DIR = path.join(__dirname, "..", "data", "tutorials");

// GET /api/tutorials/index/:language — list all available topics for a language
router.get("/index/:language", (req: Request, res: Response) => {
  const { language } = req.params;
  const langDir = path.join(DATA_DIR, language.toLowerCase());

  if (!fs.existsSync(langDir)) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const files = fs.readdirSync(langDir).filter((f) => f.endsWith(".json") && f !== ".gitkeep");
    const topics = files.map((f) => {
      const raw     = fs.readFileSync(path.join(langDir, f), "utf-8");
      const content = JSON.parse(raw);
      return { tag: content.tag, title: content.title, order: content.order ?? 999 };
    }).sort((a, b) => a.order - b.order);
    res.json({ success: true, data: topics });
  } catch {
    res.status(500).json({ error: "Failed to read tutorial index" });
  }
});

router.get("/:tag/:language", (req: Request, res: Response) => {
  const { tag, language } = req.params;

  if (!tag?.trim() || !language?.trim()) {
    res.status(400).json({ error: "tag and language are required" });
    return;
  }

  const filePath = path.join(DATA_DIR, language.toLowerCase(), `${tag.toLowerCase()}.json`);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Tutorial not available for this topic" });
    return;
  }

  try {
    const raw     = fs.readFileSync(filePath, "utf-8");
    const content = JSON.parse(raw);
    res.json({ success: true, data: { content } });
  } catch {
    res.status(500).json({ error: "Failed to read tutorial" });
  }
});

export { router as tutorialsRouter };
