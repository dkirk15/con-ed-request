import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conEdRequests, users } from "@workspace/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { getUserBalance } from "../lib/balance";

const router: IRouter = Router();

// GET /api/dashboard/employee — accessible by all authenticated users (shows own data)
router.get("/dashboard/employee", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.dbUser!;
    const balance = await getUserBalance(user.id, user.hireDate);

    const allReqs = await db
      .select({ status: conEdRequests.status })
      .from(conEdRequests)
      .where(eq(conEdRequests.employeeId, user.id));

    const counts = { pending: 0, approved: 0, reimbursed: 0, cancelled: 0 };
    for (const r of allReqs) {
      if (["pending_manager", "pending_bo"].includes(r.status)) {
        counts.pending++;
      } else if (["awaiting_receipt", "receipt_submitted"].includes(r.status)) {
        counts.approved++;
      } else if (r.status === "reimbursed") {
        counts.reimbursed++;
      } else if (r.status === "cancelled") {
        counts.cancelled++;
      }
    }

    const recentRequests = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.employeeId, user.id))
      .orderBy(desc(conEdRequests.id))
      .limit(5);

    const managers = await db
      .select({
        id: users.id,
        name: users.name,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "manager"),
          eq(users.clinicId, user.clinicId),
        ),
      );

    res.json({
      counts,
      recentRequests,
      balance,
      managers,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating employee dashboard");
    res.status(500).json({ error: "Failed to generate dashboard" });
  }
});

// GET /api/dashboard/manager
router.get("/dashboard/manager", requireAuth, requireRole("manager"), async (req: Request, res: Response) => {
  try {
    const user = req.dbUser!;
    const clinicId = user.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: "Manager is not assigned to a clinic" });
      return;
    }

    const clinicEmployees = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.clinicId, clinicId),
          eq(users.role, "employee"),
        ),
      );

    const employeeIds = clinicEmployees.map((u) => u.id);
    const allEmployeeRequests = await db
      .select()
      .from(conEdRequests)
      .where(inArray(conEdRequests.employeeId, employeeIds));

    const counts = {
      pendingApproval: 0,
      approved: 0,
      denied: 0,
      reimbursed: 0,
    };
    for (const r of allEmployeeRequests) {
      if (r.status === "pending_manager") counts.pendingApproval++;
      else if (["pending_bo", "awaiting_receipt", "receipt_submitted"].includes(r.status)) counts.approved++;
      else if (["manager_denied", "bo_denied"].includes(r.status)) counts.denied++;
      else if (r.status === "reimbursed") counts.reimbursed++;
    }

    const pendingApprovalRequests = allEmployeeRequests
      .filter((r) => r.status === "pending_manager")
      .sort((a, b) => b.id - a.id)
      .slice(0, 5);

    const recentRequests = allEmployeeRequests
      .sort((a, b) => b.id - a.id)
      .slice(0, 5);

    // Manager's own recent requests
    const myRecentRequests = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.employeeId, user.id))
      .orderBy(desc(conEdRequests.id))
      .limit(5);

    const employeesWithNames = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, employeeIds));

    const employeeMap = new Map(employeesWithNames.map((u) => [u.id, u.name]));

    res.json({
      counts,
      pendingApprovalRequests,
      recentRequests,
      myRecentRequests,
      employees: employeeMap,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating manager dashboard");
    res.status(500).json({ error: "Failed to generate dashboard" });
  }
});

// GET /api/dashboard/business-office
router.get("/dashboard/business-office", requireAuth, requireRole("business_office"), async (req: Request, res: Response) => {
  try {
    const pendingApproval = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.status, "pending_bo"))
      .orderBy(desc(conEdRequests.id))
      .limit(10);

    const ytdStart = new Date(new Date().getFullYear(), 0, 1);
    const ytdRequests = await db
      .select({
        totalRequested: sql<number>`COALESCE(SUM(${conEdRequests.approvedTotal}), 0)`,
      })
      .from(conEdRequests)
      .where(
        and(
          inArray(conEdRequests.status, ["awaiting_receipt", "receipt_submitted", "reimbursed"]),
          sql`${conEdRequests.createdAt} >= ${ytdStart}`,
        ),
      );

    const totalFunding = Number(ytdRequests[0]?.totalRequested ?? 0);

    const counts = {
      pending: pendingApproval.length,
      totalFundingYtd: totalFunding,
    };

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    res.json({
      counts,
      pendingApprovalRequests: pendingApproval,
      employees: userMap,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating business-office dashboard");
    res.status(500).json({ error: "Failed to generate dashboard" });
  }
});

// GET /api/dashboard/accounting
router.get("/dashboard/accounting", requireAuth, requireRole("accounting"), async (req: Request, res: Response) => {
  try {
    const reimbursed = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.status, "reimbursed"))
      .orderBy(desc(conEdRequests.id))
      .limit(10);

    const pendingReimbursement = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.status, "receipt_submitted"))
      .orderBy(desc(conEdRequests.id))
      .limit(10);

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    res.json({
      counts: {
        reimbursed: reimbursed.length,
        pendingReimbursement: pendingReimbursement.length,
      },
      reimbursed,
      pendingReimbursement,
      employees: userMap,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating accounting dashboard");
    res.status(500).json({ error: "Failed to generate dashboard" });
  }
});

// GET /api/dashboard/admin
router.get("/dashboard/admin", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const userCounts = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .groupBy(users.role);

    const counts = {
      employees: 0,
      managers: 0,
      businessOffice: 0,
      accounting: 0,
      admin: 0,
    };
    for (const row of userCounts) {
      if (row.role === "employee") counts.employees = Number(row.count);
      if (row.role === "manager") counts.managers = Number(row.count);
      if (row.role === "business_office") counts.businessOffice = Number(row.count);
      if (row.role === "accounting") counts.accounting = Number(row.count);
      if (row.role === "admin") counts.admin = Number(row.count);
    }

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const requests = await db
      .select()
      .from(conEdRequests)
      .orderBy(desc(conEdRequests.id))
      .limit(10);

    res.json({
      counts,
      recentRequests: requests,
      employees: userMap,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating admin dashboard");
    res.status(500).json({ error: "Failed to generate dashboard" });
  }
});

export default router;
