import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { clinics, conEdRequests, users } from "@workspace/db/schema";
import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const DAY_MS = 86_400_000;
const PERSONAL_STATUSES = [
  "draft",
  "pending_manager",
  "pending_bo",
  "awaiting_receipt",
  "receipt_submitted",
] as const;
const OPERATIONAL_STATUSES = [
  "pending_manager",
  "pending_bo",
  "awaiting_receipt",
  "receipt_submitted",
] as const;

type TaskType =
  | "draft_request"
  | "manager_approval"
  | "bo_approval"
  | "approved_purchase"
  | "receipt_submitted"
  | "reimbursement";
type TaskKind = "action" | "waiting" | "monitoring";
type TaskPriority = "standard" | "aging" | "stale";

const selection = {
  requestId: conEdRequests.id,
  employeeId: conEdRequests.employeeId,
  status: conEdRequests.status,
  courseName: conEdRequests.courseNames,
  courseStartDate: conEdRequests.courseStartDate,
  courseEndDate: conEdRequests.courseEndDate,
  updatedAt: conEdRequests.updatedAt,
  employeeName: users.name,
  clinicName: clinics.name,
};

type TaskRow = {
  requestId: number;
  employeeId: number;
  status: typeof conEdRequests.$inferSelect.status;
  courseName: string;
  courseStartDate: string | null;
  courseEndDate: string | null;
  updatedAt: Date;
  employeeName: string;
  clinicName: string | null;
};

function daysSince(value: Date | string, now: Date): number {
  const timestamp = value instanceof Date
    ? value.getTime()
    : new Date(`${value}T23:59:59`).getTime();
  return Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS));
}

function classifyPriority(
  taskType: TaskType,
  kind: TaskKind,
  ageDays: number,
  courseEnded: boolean,
): TaskPriority {
  if (kind === "waiting") return "standard";
  if (taskType === "draft_request") {
    return ageDays >= 30 ? "stale" : ageDays >= 14 ? "aging" : "standard";
  }
  if (taskType === "approved_purchase") {
    if (!courseEnded) return "standard";
    return ageDays >= 30 ? "stale" : ageDays >= 7 ? "aging" : "standard";
  }
  return ageDays >= 7 ? "stale" : ageDays >= 3 ? "aging" : "standard";
}

function taskIdentity(
  row: TaskRow,
  role: NonNullable<Request["dbUser"]>["role"],
): { taskType: TaskType; kind: TaskKind } {
  if (row.status === "draft") return { taskType: "draft_request", kind: "action" };
  if (row.status === "awaiting_receipt") {
    return role === "admin"
      ? { taskType: "approved_purchase", kind: "monitoring" }
      : { taskType: "approved_purchase", kind: "action" };
  }
  if (row.status === "receipt_submitted") {
    if (role === "accounting") return { taskType: "reimbursement", kind: "action" };
    if (role === "admin") return { taskType: "reimbursement", kind: "monitoring" };
    return { taskType: "receipt_submitted", kind: "waiting" };
  }
  if (row.status === "pending_manager") {
    return role === "manager"
      ? { taskType: "manager_approval", kind: "action" }
      : role === "admin"
        ? { taskType: "manager_approval", kind: "monitoring" }
        : { taskType: "manager_approval", kind: "waiting" };
  }
  return role === "business_office"
    ? { taskType: "bo_approval", kind: "action" }
    : role === "admin"
      ? { taskType: "bo_approval", kind: "monitoring" }
      : { taskType: "bo_approval", kind: "waiting" };
}

function roleCondition(user: NonNullable<Request["dbUser"]>): SQL {
  if (user.role === "employee") {
    return and(
      eq(conEdRequests.employeeId, user.id),
      inArray(conEdRequests.status, [...PERSONAL_STATUSES]),
    )!;
  }
  if (user.role === "manager") {
    const clinicApprovals = user.clinicId
      ? and(
          eq(conEdRequests.status, "pending_manager"),
          eq(users.clinicId, user.clinicId),
        )
      : sql`false`;
    return or(
      and(
        eq(conEdRequests.employeeId, user.id),
        inArray(conEdRequests.status, [...PERSONAL_STATUSES]),
      ),
      clinicApprovals,
    )!;
  }
  if (user.role === "business_office") return eq(conEdRequests.status, "pending_bo");
  if (user.role === "accounting") return eq(conEdRequests.status, "receipt_submitted");
  return inArray(conEdRequests.status, [...OPERATIONAL_STATUSES]);
}

router.get("/tasks", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.dbUser!;
    const rows = await db
      .select(selection)
      .from(conEdRequests)
      .innerJoin(users, eq(conEdRequests.employeeId, users.id))
      .leftJoin(clinics, eq(users.clinicId, clinics.id))
      .where(roleCondition(user))
      .orderBy(asc(conEdRequests.updatedAt));

    const now = new Date();
    const items = (rows as TaskRow[]).map((row) => {
      const { taskType, kind } = taskIdentity(row, user.role);
      const courseEnded = Boolean(
        row.courseEndDate && new Date(`${row.courseEndDate}T23:59:59`) < now,
      );
      const ageDays = taskType === "approved_purchase" && row.courseEndDate
        ? daysSince(row.courseEndDate, now)
        : daysSince(row.updatedAt, now);
      return {
        requestId: row.requestId,
        taskType,
        kind,
        priority: classifyPriority(taskType, kind, ageDays, courseEnded),
        status: row.status,
        courseName: row.courseName,
        employeeName: row.employeeName,
        clinicName: row.clinicName ?? null,
        courseStartDate: row.courseStartDate,
        courseEndDate: row.courseEndDate,
        ageDays,
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    const priorityOrder: Record<TaskPriority, number> = { stale: 0, aging: 1, standard: 2 };
    items.sort((a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority]
      || Number(b.kind === "action") - Number(a.kind === "action")
      || b.ageDays - a.ageDays
      || a.requestId - b.requestId
    );

    const ownActionCount = items.filter((item) =>
      item.kind === "action"
      && (item.taskType === "draft_request" || item.taskType === "approved_purchase")
    ).length;
    const approvalCount = items.filter((item) =>
      item.kind === "action"
      && (item.taskType === "manager_approval" || item.taskType === "bo_approval")
    ).length;
    const reimbursementCount = items.filter((item) =>
      item.kind === "action" && item.taskType === "reimbursement"
    ).length;
    const staleCount = items.filter((item) => item.priority === "stale").length;

    res.json({
      navigationCounts: {
        myRequests: ownActionCount,
        approvals: approvalCount,
        reimbursements: reimbursementCount,
        reports: user.role === "admin" ? staleCount : 0,
      },
      actionCount: items.filter((item) => item.kind === "action").length,
      agingCount: items.filter((item) => item.priority === "aging").length,
      staleCount,
      items: items.slice(0, 8),
    });
  } catch (err) {
    req.log.error({ err }, "taskCenter error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
