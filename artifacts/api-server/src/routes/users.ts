import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { users, clinics } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  CreateUserBody,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  ListUsersQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";
import { getUserBalance } from "../lib/balance";

const router: IRouter = Router();

async function formatUser(user: typeof users.$inferSelect) {
  let clinicName: string | null = null;
  if (user.clinicId) {
    const [clinic] = await db
      .select({ name: clinics.name })
      .from(clinics)
      .where(eq(clinics.id, user.clinicId))
      .limit(1);
    clinicName = clinic?.name ?? null;
  }

  let managerName: string | null = null;
  if (user.managerId) {
    const [manager] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.managerId))
      .limit(1);
    managerName = manager?.name ?? null;
  }

  return {
    id: user.id,
    clerkId: user.clerkId,
    name: user.name,
    email: user.email,
    role: user.role,
    clinicId: user.clinicId ?? null,
    clinicName,
    managerId: user.managerId ?? null,
    managerName,
    hireDate: user.hireDate ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /api/users/me
router.get("/users/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    // Auto-provision user from Clerk data if not in DB
    if (!user) {
      res.status(403).json({ error: "User not provisioned. Contact your administrator." });
      return;
    }

    res.json(await formatUser(user));
  } catch (err) {
    req.log.error({ err }, "getMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:userId/balance
router.get("/users/:userId/balance", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const balance = await getUserBalance(user.id, user.hireDate);
    res.json(balance);
  } catch (err) {
    req.log.error({ err }, "getUserBalance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users
router.get("/users", requireRole("admin", "manager"), async (req: Request, res: Response) => {
  try {
    const parsed = ListUsersQueryParams.safeParse(req.query);
    const filters: Parameters<typeof db.select>[0] extends undefined
      ? unknown[]
      : unknown[] = [];

    let query = db.select().from(users);
    const conditions = [];

    if (parsed.success) {
      if (parsed.data.role) {
        conditions.push(eq(users.role, parsed.data.role as typeof users.role.dataType));
      }
      if (parsed.data.clinicId != null) {
        conditions.push(eq(users.clinicId, Number(parsed.data.clinicId)));
      }
    }

    // Managers can only see their clinic's employees
    if (req.dbUser?.role === "manager" && req.dbUser.clinicId) {
      conditions.push(eq(users.clinicId, req.dbUser.clinicId));
    }

    const allUsers = conditions.length
      ? await db.select().from(users).where(and(...conditions))
      : await db.select().from(users);

    const formatted = await Promise.all(allUsers.map(formatUser));
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "listUsers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users
router.post("/users", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { clerkId, name, email, role, clinicId, managerId, hireDate } = parsed.data;

    const [user] = await db
      .insert(users)
      .values({
        clerkId,
        name,
        email,
        role: role as typeof users.role.dataType,
        clinicId: clinicId ?? null,
        managerId: managerId ?? null,
        hireDate: hireDate ?? null,
      })
      .returning();

    res.status(201).json(await formatUser(user));
  } catch (err) {
    req.log.error({ err }, "createUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:userId
router.get("/users/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = GetUserParams.safeParse({ userId: parseInt(req.params.userId) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(await formatUser(user));
  } catch (err) {
    req.log.error({ err }, "getUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/:userId
router.patch("/users/:userId", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const parsed = UpdateUserParams.safeParse({ userId: parseInt(req.params.userId) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const bodyParsed = UpdateUserBody.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const updates: Partial<typeof users.$inferInsert> = {};
    if (bodyParsed.data.role !== undefined) {
      updates.role = bodyParsed.data.role as typeof users.role.dataType;
    }
    if (bodyParsed.data.clinicId !== undefined) {
      updates.clinicId = bodyParsed.data.clinicId ?? null;
    }
    if (bodyParsed.data.managerId !== undefined) {
      updates.managerId = bodyParsed.data.managerId ?? null;
    }
    if (bodyParsed.data.hireDate !== undefined) {
      updates.hireDate = bodyParsed.data.hireDate ?? null;
    }

    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, parsed.data.userId))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(await formatUser(user));
  } catch (err) {
    req.log.error({ err }, "updateUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
