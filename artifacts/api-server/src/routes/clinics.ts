import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { clinics, users } from "@workspace/db/schema";
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

// DELETE /api/clinics/:id — admin only
router.delete(
  "/clinics/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const rawId = String(req.params.id ?? "");
      if (!/^[1-9]\d*$/.test(rawId)) {
        res.status(400).json({ error: "Invalid clinic ID" });
        return;
      }
      const id = Number(rawId);

      // Refuse deletion while any users still reference this clinic.
      const [{ count: assigned }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.clinicId, id));
      if (assigned > 0) {
        res.status(409).json({
          error:
            "Cannot delete a clinic that still has employees assigned to it. Reassign those employees first.",
        });
        return;
      }

      const [deleted] = await db
        .delete(clinics)
        .where(eq(clinics.id, id))
        .returning({ id: clinics.id });
      if (!deleted) {
        res.status(404).json({ error: "Clinic not found" });
        return;
      }

      res.status(204).send();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      // Foreign-key violation: users still reference this clinic.
      // drizzle wraps the pg error, so the SQLSTATE may sit on err.cause.code.
      if (err?.code === "23503" || err?.cause?.code === "23503") {
        res.status(409).json({
          error:
            "Cannot delete a clinic that still has employees assigned to it. Reassign those employees first.",
        });
        return;
      }
      req.log.error({ err }, "deleteClinic error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
