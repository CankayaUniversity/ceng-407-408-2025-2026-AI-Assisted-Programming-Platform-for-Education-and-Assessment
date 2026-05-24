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

// GET /api/tutorials/index/:language — list all available topics grouped by
// category → sub-category → topic. Sub-category is null for topics that sit
// directly under a main category (e.g. "C Files" has 3 topics with no
// further grouping). Index responses mirror the manifest structure.
router.get("/index/:language", (req: Request, res: Response) => {
  const { language } = req.params;
  const langDir = path.join(DATA_DIR, language.toLowerCase());

  if (!fs.existsSync(langDir)) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const files = fs.readdirSync(langDir)
      .filter((f) => f.endsWith(".json") && f !== ".gitkeep" && !f.startsWith("_"));

    // Build flat list with full categorisation info from each JSON file.
    type FlatTopic = {
      tag:              string;
      title:            string;
      order:            number;
      category:         string;
      categoryOrder:    number;
      subCategory:      string | null;
      subCategoryOrder: number;
    };

    const topics: FlatTopic[] = files.map((f) => {
      const raw     = fs.readFileSync(path.join(langDir, f), "utf-8");
      const content = JSON.parse(raw);
      return {
        tag:              content.tag,
        title:            content.title,
        order:            content.order            ?? 999,
        category:         content.category         ?? "General",
        categoryOrder:    content.categoryOrder    ?? 999,
        subCategory:      content.subCategory      ?? null,
        subCategoryOrder: content.subCategoryOrder ?? 0,
      };
    });

    // Group by category → sub-category → topics.
    // `subCategory: null` means "directly under the main category".
    type SubGroup = {
      subCategory:      string | null;
      subCategoryOrder: number;
      topics:           FlatTopic[];
    };
    type CatGroup = {
      category:         string;
      categoryOrder:    number;
      subCategories:    SubGroup[];
    };
    const byCategory: Record<string, CatGroup> = {};

    for (const t of topics) {
      if (!byCategory[t.category]) {
        byCategory[t.category] = {
          category:      t.category,
          categoryOrder: t.categoryOrder,
          subCategories: [],
        };
      }
      const cat = byCategory[t.category];
      const subKey = t.subCategory ?? "__none__";
      let sub = cat.subCategories.find((s) => (s.subCategory ?? "__none__") === subKey);
      if (!sub) {
        sub = {
          subCategory:      t.subCategory,
          subCategoryOrder: t.subCategoryOrder,
          topics:           [],
        };
        cat.subCategories.push(sub);
      }
      sub.topics.push(t);
    }

    // Sort: categories by categoryOrder, sub-categories by subCategoryOrder,
    // topics within each sub-category by order.
    const result = Object.values(byCategory)
      .sort((a, b) => a.categoryOrder - b.categoryOrder)
      .map((cat) => ({
        ...cat,
        subCategories: cat.subCategories
          .sort((a, b) => a.subCategoryOrder - b.subCategoryOrder)
          .map((sub) => ({
            ...sub,
            topics: sub.topics.sort((a, b) => a.order - b.order),
          })),
      }));

    res.json({ success: true, data: result });
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
