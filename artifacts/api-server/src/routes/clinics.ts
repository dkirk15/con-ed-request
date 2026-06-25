import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { clinics } from "@workspace/db/schema";
import { CreateClinicBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

router.get("/clinics", requireAuth, async (req: Request, res: Response) => {
  try {
    const all = await db.select().from(clinics).orderBy(clinics.name);
    res.json(all.map((c) => ({ id: c.id, name: c.name })));
  } catch (err) {
    req.log.error({ err }, "listClinics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/clinics — admin only
router.post("/clinics", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const parsed = CreateClinicBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const name = parsed.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Clinic name is required" });
      return;
    }

    // Case-insensitive duplicate guard (clinic names should be unique).
    const [existing] = await db
      .select({ id: clinics.id })
      .from(clinics)
      .where(sql`lower(${clinics.name}) = lower(${name})`)
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "A clinic with this name already exists" });
      return;
    }

    const [clinic] = await db.insert(clinics).values({ name }).returning();
    res.status(201).json({ id: clinic.id, name: clinic.name });
  } catch (err) {
    req.log.error({ err }, "createClinic error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
