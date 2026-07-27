import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conEdSettings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../lib/auth";
import { getSettings, invalidateSettingsCache } from "../lib/settings";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /api/settings — admin only
router.get("/settings", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    res.json({
      annualBudget: settings.annualBudget,
      updatedAt: settings.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "getSettings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/settings — admin only
router.patch("/settings", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const parsed = UpdateSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
      return;
    }

    const { annualBudget } = parsed.data;
    if (annualBudget === undefined) {
      // Nothing to update — return current settings
      const settings = await getSettings();
      res.json({
        annualBudget: settings.annualBudget,
        updatedAt: settings.updatedAt.toISOString(),
      });
      return;
    }

    // Upsert: update the singleton row, or insert if it doesn't exist yet.
    const [existing] = await db.select({ id: conEdSettings.id }).from(conEdSettings).limit(1);

    let row;
    if (existing) {
      [row] = await db
        .update(conEdSettings)
        .set({ annualBudget: String(annualBudget), updatedAt: new Date() })
        .where(eq(conEdSettings.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(conEdSettings)
        .values({ annualBudget: String(annualBudget) })
        .returning();
    }

    invalidateSettingsCache();

    res.json({
      annualBudget: parseFloat(row.annualBudget),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "updateSettings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
