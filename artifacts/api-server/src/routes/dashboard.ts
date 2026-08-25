import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conEdRequests, users } from "@workspace/db/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { getUserBalance } from "../lib/balance";

const router: IRouter = Router();

// GET /api/dashboard/employee — accessible by all authenticated users (shows own data)
router.get("/dashboard/employee", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.dbUser!;
    const balance = await getUserBalance(user.id, user.hireDate, user.conEdAllocation);

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
      } else if (r.status === "cancelled" || r.status === "manager_denied" || r.status === "bo_denied") {
        counts.cancelled++;
      }
    }

    const recentRows = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.employeeId, user.id))
      .orderBy(desc(conEdRequests.updatedAt))
      .limit(5);

    const { formatRequestSimple } = await import("./requestHelpers");
    const recentRequests = await Promise.all(recentRows.map(formatRequestSimple));

    res.json({ balance, requestCounts: counts, recentRequests });
  } catch (err) {
    req.log.error({ err }, "employeeDashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/manager — manager or admin only
router.get(
  "/dashboard/manager",
  requireRole("manager", "admin"),
  async (req: Request, res: Response) => {
    try {
      const user = req.dbUser!;
      const balance = await getUserBalance(user.id, user.hireDate, user.conEdAllocation);

      let clinicEmployeeIds: number[] = [];
      if (user.clinicId) {
        const employees = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clinicId, user.clinicId));
        clinicEmployeeIds = employees.map((e) => e.id);
      }

      const clinicEmployeeCount = clinicEmployeeIds.length;

      let pendingRows: (typeof conEdRequests.$inferSelect)[] = [];
      let approvedCount = 0;
      let totalClinicSpend = 0;

      if (clinicEmployeeIds.length > 0) {
        pendingRows = await db
          .select()
          .from(conEdRequests)
          .where(
            and(
              inArray(conEdRequests.employeeId, clinicEmployeeIds),
              eq(conEdRequests.status, "pending_manager"),
            ),
          )
          .orderBy(desc(conEdRequests.createdAt));

        const yearStart = new Date(`${new Date().getFullYear()}-01-01`);
        const approvedRows = await db
          .select({
            status: conEdRequests.status,
            totalApproved: conEdRequests.totalApproved,
          })
          .from(conEdRequests)
          .where(
            and(
              inArray(conEdRequests.employeeId, clinicEmployeeIds),
              sql`${conEdRequests.createdAt} >= ${yearStart}`,
            ),
          );

        approvedCount = approvedRows.filter((r) =>
          ["awaiting_receipt", "receipt_submitted", "reimbursed"].includes(r.status),
        ).length;

        totalClinicSpend = approvedRows
          .filter((r) => ["awaiting_receipt", "receipt_submitted", "reimbursed"].includes(r.status))
          .reduce((sum, r) => sum + parseFloat(r.totalApproved ?? "0"), 0);
      }

      const myRecentRows = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.employeeId, user.id))
        .orderBy(desc(conEdRequests.updatedAt))
        .limit(5);

      const { formatRequestSimple } = await import("./requestHelpers");
      const pendingClinicRequests = await Promise.all(pendingRows.map(formatRequestSimple));
      const myRecentRequests = await Promise.all(myRecentRows.map(formatRequestSimple));

      res.json({
        myBalance: balance,
        pendingClinicRequests,
        myRecentRequests,
        clinicEmployeeCount,
        requestCounts: {
          pendingMyApproval: pendingRows.length,
          approvedThisYear: approvedCount,
          totalClinicSpend: Math.round(totalClinicSpend * 100) / 100,
        },
      });
    } catch (err) {
      req.log.error({ err }, "managerDashboard error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/dashboard/business-office — BO or admin only
router.get(
  "/dashboard/business-office",
  requireRole("business_office", "admin"),
  async (req: Request, res: Response) => {
    try {
      const pendingRows = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.status, "pending_bo"))
        .orderBy(desc(conEdRequests.updatedAt));

      const awaitingRows = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.status, "awaiting_receipt"))
        .orderBy(desc(conEdRequests.updatedAt));

      // YTD = all requests that have passed BO approval (awaiting_receipt + receipt_submitted + reimbursed)
      const approvedYtdRows = await db
        .select({ totalApproved: conEdRequests.totalApproved })
        .from(conEdRequests)
        .where(
          inArray(conEdRequests.status, ["awaiting_receipt", "receipt_submitted", "reimbursed"])
        );

      const totalFundingApproved = approvedYtdRows.reduce(
        (sum, r) => sum + parseFloat(r.totalApproved ?? "0"),
        0,
      );
      const totalPendingAmount = pendingRows.reduce(
        (sum, r) => sum + parseFloat(r.totalRequested),
        0,
      );

      const { formatRequestSimple } = await import("./requestHelpers");
      const pendingApproval = await Promise.all(pendingRows.map(formatRequestSimple));
      const approvedAwaitingReceipt = await Promise.all(awaitingRows.map(formatRequestSimple));

      res.json({
        pendingApproval,
        approvedAwaitingReceipt,
        totalFundingApproved: Math.round(totalFundingApproved * 100) / 100,
        totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      });
    } catch (err) {
      req.log.error({ err }, "boDashboard error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/dashboard/accounting — accounting or admin only
router.get(
  "/dashboard/accounting",
  requireRole("accounting", "admin"),
  async (req: Request, res: Response) => {
    try {
      const pendingRows = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.status, "receipt_submitted"))
        .orderBy(desc(conEdRequests.updatedAt));

      const recentlyReimbursedRows = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.status, "reimbursed"))
        .orderBy(desc(conEdRequests.updatedAt))
        .limit(10);

      const totalPendingAmount = pendingRows.reduce(
        (sum, r) => sum + parseFloat(r.totalApproved ?? r.totalRequested),
        0,
      );

      const { formatRequestSimple } = await import("./requestHelpers");
      const pendingReimbursement = await Promise.all(pendingRows.map(formatRequestSimple));
      const recentlyReimbursed = await Promise.all(recentlyReimbursedRows.map(formatRequestSimple));

      res.json({
        pendingReimbursement,
        recentlyReimbursed,
        totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      });
    } catch (err) {
      req.log.error({ err }, "accountingDashboard error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/dashboard/admin — admin only
router.get(
  "/dashboard/admin",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const allUsers = await db
        .select({
          role: users.role,
          createdAt: users.createdAt,
          id: users.id,
          clerkId: users.clerkId,
          name: users.name,
          email: users.email,
          clinicId: users.clinicId,
          managerId: users.managerId,
          hireDate: users.hireDate,
        })
        .from(users);

      const totalUsers = allUsers.length;
      const byRole = {
        employee: 0,
        manager: 0,
        business_office: 0,
        accounting: 0,
        admin: 0,
      };
      for (const u of allUsers) {
        byRole[u.role as keyof typeof byRole]++;
      }

      const recentUsers = [...allUsers]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map((u) => ({
          id: u.id,
          clerkId: u.clerkId,
          name: u.name,
          email: u.email,
          role: u.role,
          clinicId: u.clinicId ?? null,
          clinicName: null,
          managerId: u.managerId ?? null,
          managerName: null,
          hireDate: u.hireDate ?? null,
          createdAt: u.createdAt.toISOString(),
        }));

      res.json({
        totalUsers,
        usersByRole: byRole,
        recentUsers,
        pendingRoleAssignment: [],
      });
    } catch (err) {
      req.log.error({ err }, "adminDashboard error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
