import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { users, clinics, conEdAllocationOverrides, repaymentGuarantees } from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
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

async function currentAllocationOverride(user: typeof users.$inferSelect) {
  const [override] = await db
    .select({ allocation: conEdAllocationOverrides.allocation })
    .from(conEdAllocationOverrides)
    .where(and(
      eq(conEdAllocationOverrides.userId, user.id),
      eq(conEdAllocationOverrides.year, new Date().getFullYear()),
    ))
    .limit(1);
  return override?.allocation ?? user.conEdAllocation;
}

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

  const allocationOverride = await currentAllocationOverride(user);
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
    conEdAllocation: allocationOverride != null
      ? parseFloat(allocationOverride)
      : null,
    createdAt: user.createdAt.toISOString(),
  };
}

function formatGuarantee(g: typeof repaymentGuarantees.$inferSelect) {
  return {
    id: g.id,
    requestId: g.requestId,
    employeeId: g.employeeId,
    signedName: g.signedName,
    signedDate: g.signedDate ?? null,
    signedAt: g.signedAt.toISOString(),
    acknowledged: g.acknowledged,
    email: g.email ?? null,
    ipAddress: g.ipAddress ?? null,
    sessionId: g.sessionId ?? null,
  };
}

// GET /api/users/me
router.get("/users/me", requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(await formatUser(req.dbUser!));
  } catch (err) {
    req.log.error({ err }, "getMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:userId/balance — own or admin only
router.get("/users/:userId/balance", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId as string);
    const caller = req.dbUser!;

    // Employees can only see their own balance; managers can see their clinic members; admin sees all
    if (caller.role === "employee" && caller.id !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (
      caller.role === "manager" &&
      caller.id !== targetUser.id &&
      (!caller.clinicId || targetUser.clinicId !== caller.clinicId)
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const currentOverride = await currentAllocationOverride(targetUser);
    const alloc = currentOverride != null ? parseFloat(currentOverride) : null;
    const balance = await getUserBalance(targetUser.id, targetUser.hireDate, alloc);
    res.json(balance);
  } catch (err) {
    req.log.error({ err }, "getUserBalance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users — admin or manager (managers see only their clinic)
router.get("/users", requireRole("admin", "manager"), async (req: Request, res: Response) => {
  try {
    const parsed = ListUsersQueryParams.safeParse(req.query);
    const conditions = [];

    if (parsed.success) {
      if (parsed.data.role) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conditions.push(eq(users.role, parsed.data.role as any));
      }
      if (parsed.data.clinicId != null) {
        conditions.push(eq(users.clinicId, Number(parsed.data.clinicId)));
      }
    }

    // Managers can only see their clinic's staff
    if (req.dbUser?.role === "manager") {
      if (!req.dbUser.clinicId) {
        res.json([]);
        return;
      }
      conditions.push(eq(users.clinicId, req.dbUser.clinicId));
    }

    const allUsers = conditions.length
      ? await db.select().from(users).where(and(...conditions))
      : await db.select().from(users);

    const formatted = await Promise.all(allUsers.map(formatUser));

    // Attach each user's signed repayment agreements for the directory view.
    const userIds = allUsers.map((u) => u.id);
    const guaranteesByUser = new Map<number, ReturnType<typeof formatGuarantee>[]>();
    if (userIds.length) {
      const guaranteeRows = await db
        .select()
        .from(repaymentGuarantees)
        .where(inArray(repaymentGuarantees.employeeId, userIds));
      for (const g of guaranteeRows) {
        const list = guaranteesByUser.get(g.employeeId) ?? [];
        list.push(formatGuarantee(g));
        guaranteesByUser.set(g.employeeId, list);
      }
    }

    const withGuarantees = formatted.map((u) => ({
      ...u,
      repaymentGuarantees: (guaranteesByUser.get(u.id) ?? []).sort((a, b) =>
        a.signedAt < b.signedAt ? 1 : -1,
      ),
    }));

    res.json(withGuarantees);
  } catch (err) {
    req.log.error({ err }, "listUsers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users — admin only
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      role: role as any,
        clinicId: clinicId ?? null,
        managerId: managerId ?? null,
        hireDate: hireDate ? (hireDate as unknown as string) : null,
      })
      .returning();

    res.status(201).json(await formatUser(user));
  } catch (err) {
    req.log.error({ err }, "createUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:userId — own profile, or manager for clinic members, or admin
router.get("/users/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = GetUserParams.safeParse({ userId: parseInt(req.params.userId as string) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const caller = req.dbUser!;

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1);

    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Employee can only view own profile
    if (caller.role === "employee" && caller.id !== targetUser.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Manager can only view members of their clinic
    if (
      caller.role === "manager" &&
      caller.id !== targetUser.id &&
      (!caller.clinicId || targetUser.clinicId !== caller.clinicId)
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(await formatUser(targetUser));
  } catch (err) {
    req.log.error({ err }, "getUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/:userId — admin or own profile (self can only update name)
router.patch("/users/:userId", requireAuth, async (req: Request, res: Response) => {
  const caller = req.dbUser!;
  const targetUserId = parseInt(req.params.userId as string);

  const isSelf = caller.id === targetUserId;
  const isAdmin = caller.role === "admin";

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const parsed = UpdateUserParams.safeParse({ userId: parseInt(req.params.userId as string) });
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
    if (bodyParsed.data.name !== undefined) {
      updates.name = bodyParsed.data.name;
    }
    if (isAdmin) {
      if (bodyParsed.data.role !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updates.role = bodyParsed.data.role as any;
      }
      if (bodyParsed.data.clinicId !== undefined) {
        updates.clinicId = bodyParsed.data.clinicId ?? null;
      }
      if (bodyParsed.data.managerId !== undefined) {
        updates.managerId = bodyParsed.data.managerId ?? null;
      }
      if (bodyParsed.data.hireDate !== undefined) {
        updates.hireDate = bodyParsed.data.hireDate ? (bodyParsed.data.hireDate as unknown as string) : null;
      }
      if (bodyParsed.data.conEdAllocation !== undefined) {
        updates.conEdAllocation = bodyParsed.data.conEdAllocation != null ? String(bodyParsed.data.conEdAllocation) : null;
      }
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

    if (isAdmin && bodyParsed.data.conEdAllocation !== undefined) {
      const currentYear = new Date().getFullYear();
      if (bodyParsed.data.conEdAllocation == null) {
        await db.delete(conEdAllocationOverrides).where(and(
          eq(conEdAllocationOverrides.userId, user.id),
          eq(conEdAllocationOverrides.year, currentYear),
        ));
      } else {
        await db.insert(conEdAllocationOverrides).values({
          userId: user.id,
          year: currentYear,
          allocation: String(bodyParsed.data.conEdAllocation),
        }).onConflictDoUpdate({
          target: [conEdAllocationOverrides.userId, conEdAllocationOverrides.year],
          set: { allocation: String(bodyParsed.data.conEdAllocation), updatedAt: new Date() },
        });
      }
    }

    res.json(await formatUser(user));
  } catch (err) {
    req.log.error({ err }, "updateUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/users/:userId — admin only, cannot delete self
router.delete("/users/:userId", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const rawUserId = String(req.params.userId ?? "");
    if (!/^[1-9]\d*$/.test(rawUserId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const userId = Number(rawUserId);

    if (req.dbUser!.id === userId) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const [deleted] = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    if (!deleted) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(204).send();
  } catch (err: any) {
    // drizzle wraps the pg error, so the FK SQLSTATE may sit on err.cause.code.
    if (err?.code === "23503" || err?.cause?.code === "23503") {
      res.status(409).json({ error: "Cannot delete user with existing requests or records. Remove their data first." });
      return;
    }
    req.log.error({ err }, "deleteUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
