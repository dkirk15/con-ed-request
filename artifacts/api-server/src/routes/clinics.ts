import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { clinics } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";

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

export default router;
