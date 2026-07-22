import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { clinics, conEdRequests, reimbursements, users } from "@workspace/db/schema";
import {
  ExportReportQueryParams,
  GetReportQueryParams,
} from "@workspace/api-zod";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const REPORT_ROLES = ["manager", "business_office", "accounting", "admin"] as const;
const ACTIVE_STAGES = [
  { status: "pending_manager", label: "Manager approval" },
  { status: "pending_bo", label: "CE approval" },
  { status: "awaiting_receipt", label: "Awaiting receipt" },
  { status: "receipt_submitted", label: "Ready to reimburse" },
] as const;

type ParsedReportFilters = ReturnType<typeof GetReportQueryParams.parse>;
type ReportFilters = Omit<ParsedReportFilters, "year"> & { year: number };

function normalizeFilters(filters: ParsedReportFilters): ReportFilters {
  return { ...filters, year: filters.year ?? new Date().getFullYear() };
}

function reportConditions(user: NonNullable<Request["dbUser"]>, filters: ReportFilters): SQL[] {
  const yearStart = new Date(`${filters.year}-01-01T00:00:00`);
  const yearEnd = new Date(`${filters.year + 1}-01-01T00:00:00`);
  const conditions: SQL[] = [
    gte(conEdRequests.createdAt, yearStart),
    lt(conEdRequests.createdAt, yearEnd),
  ];

  if (user.role === "manager") {
    conditions.push(user.clinicId ? eq(users.clinicId, user.clinicId) : sql`false`);
  } else if (filters.clinicId != null) {
    conditions.push(eq(users.clinicId, filters.clinicId));
  }

  if (filters.employeeId != null) conditions.push(eq(conEdRequests.employeeId, filters.employeeId));
  if (filters.status) conditions.push(eq(conEdRequests.status, filters.status));
  if (filters.deliveryMethod) conditions.push(eq(conEdRequests.deliveryMethod, filters.deliveryMethod));
  if (filters.courseFrom) conditions.push(gte(conEdRequests.courseEndDate, filters.courseFrom));
  if (filters.courseTo) conditions.push(lte(conEdRequests.courseStartDate, filters.courseTo));

  if (filters.search?.trim()) {
    const query = `%${filters.search.trim()}%`;
    const searchCondition = or(
      ilike(conEdRequests.courseNames, query),
      ilike(conEdRequests.courseProvider, query),
      ilike(users.name, query),
      ilike(users.email, query),
      ilike(clinics.name, query),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  return conditions;
}

const reportSelection = {
  id: conEdRequests.id,
  employeeId: conEdRequests.employeeId,
  employeeName: users.name,
  employeeEmail: users.email,
  clinicId: users.clinicId,
  clinicName: clinics.name,
  status: conEdRequests.status,
  courseName: conEdRequests.courseNames,
  courseProvider: conEdRequests.courseProvider,
  courseUrl: conEdRequests.courseUrl,
  courseStartDate: conEdRequests.courseStartDate,
  courseEndDate: conEdRequests.courseEndDate,
  legacyCourseDates: conEdRequests.courseDates,
  deliveryMethod: conEdRequests.deliveryMethod,
  location: conEdRequests.location,
  totalRequested: conEdRequests.totalRequested,
  totalApproved: conEdRequests.totalApproved,
  reimbursementAmount: reimbursements.amount,
  paycheckDate: reimbursements.paycheckDate,
  managerApprovedAt: conEdRequests.managerApprovedAt,
  managerDeniedAt: conEdRequests.managerDeniedAt,
  boApprovedAt: conEdRequests.boApprovedAt,
  boDeniedAt: conEdRequests.boDeniedAt,
  createdAt: conEdRequests.createdAt,
  updatedAt: conEdRequests.updatedAt,
};

function reportBaseQuery() {
  return db
    .select(reportSelection)
    .from(conEdRequests)
    .innerJoin(users, eq(conEdRequests.employeeId, users.id))
    .leftJoin(clinics, eq(users.clinicId, clinics.id))
    .leftJoin(reimbursements, eq(conEdRequests.id, reimbursements.requestId));
}

function formatRow(row: Awaited<ReturnType<typeof reportBaseQuery>>[number]) {
  const fallbackReimbursement = row.status === "reimbursed"
    ? row.totalApproved ?? row.totalRequested
    : null;

  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeEmail: row.employeeEmail,
    clinicId: row.clinicId ?? null,
    clinicName: row.clinicName ?? null,
    status: row.status,
    courseName: row.courseName,
    courseProvider: row.courseProvider ?? null,
    courseUrl: row.courseUrl ?? null,
    courseStartDate: row.courseStartDate ?? null,
    courseEndDate: row.courseEndDate ?? null,
    legacyCourseDates: row.legacyCourseDates ?? null,
    deliveryMethod: row.deliveryMethod as "in_person" | "virtual" | "hybrid" | null,
    location: row.location ?? null,
    totalRequested: Number(row.totalRequested),
    totalApproved: row.totalApproved == null ? null : Number(row.totalApproved),
    reimbursementAmount: row.reimbursementAmount == null
      ? fallbackReimbursement == null ? null : Number(fallbackReimbursement)
      : Number(row.reimbursementAmount),
    paycheckDate: row.paycheckDate ?? null,
    managerDecisionAt: (row.managerApprovedAt ?? row.managerDeniedAt)?.toISOString() ?? null,
    boDecisionAt: (row.boApprovedAt ?? row.boDeniedAt)?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function reportOrder(filters: Pick<ReportFilters, "sort" | "order">) {
  const columns = {
    createdAt: conEdRequests.createdAt,
    courseStartDate: conEdRequests.courseStartDate,
    employeeName: users.name,
    totalRequested: conEdRequests.totalRequested,
    totalApproved: conEdRequests.totalApproved,
    status: conEdRequests.status,
  } as const;
  return filters.order === "asc" ? asc(columns[filters.sort]) : desc(columns[filters.sort]);
}

router.get(
  "/reports/options",
  requireRole(...REPORT_ROLES),
  async (req: Request, res: Response) => {
    try {
      const user = req.dbUser!;
      const roleCondition = user.role === "manager"
        ? user.clinicId ? eq(users.clinicId, user.clinicId) : sql`false`
        : undefined;

      const employeeConditions = [inArray(users.role, ["employee", "manager"] as const)];
      if (roleCondition) employeeConditions.push(roleCondition);

      const [yearRows, clinicRows, employeeRows] = await Promise.all([
        db
          .selectDistinct({ year: sql<number>`extract(year from ${conEdRequests.createdAt})::int` })
          .from(conEdRequests)
          .innerJoin(users, eq(conEdRequests.employeeId, users.id))
          .where(roleCondition)
          .orderBy(desc(sql`extract(year from ${conEdRequests.createdAt})`)),
        user.role === "manager"
          ? user.clinicId
            ? db.select().from(clinics).where(eq(clinics.id, user.clinicId)).orderBy(asc(clinics.name))
            : Promise.resolve([])
          : db.select().from(clinics).orderBy(asc(clinics.name)),
        db
          .select({ id: users.id, name: users.name, clinicId: users.clinicId, clinicName: clinics.name })
          .from(users)
          .leftJoin(clinics, eq(users.clinicId, clinics.id))
          .where(and(...employeeConditions))
          .orderBy(asc(users.name)),
      ]);

      const currentYear = new Date().getFullYear();
      const years = Array.from(new Set([currentYear, ...yearRows.map((row) => row.year)]))
        .sort((a, b) => b - a);
      res.json({
        years,
        clinics: clinicRows.map((clinic) => ({ id: clinic.id, name: clinic.name })),
        employees: employeeRows.map((employee) => ({
          id: employee.id,
          name: employee.name,
          clinicId: employee.clinicId ?? null,
          clinicName: employee.clinicName ?? null,
        })),
      });
    } catch (err) {
      req.log.error({ err }, "reportOptions error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get(
  "/reports",
  requireRole(...REPORT_ROLES),
  async (req: Request, res: Response) => {
    try {
      const parsed = GetReportQueryParams.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid report filters" });
        return;
      }

      const filters = normalizeFilters(parsed.data);
      const conditions = reportConditions(req.dbUser!, filters);
      const whereClause = and(...conditions);
      const offset = (filters.page - 1) * filters.pageSize;

      const [summaryRows, workflowRows, detailRows] = await Promise.all([
        db
          .select({
            totalRequests: sql<number>`count(*)::int`,
            totalRequested: sql<string>`coalesce(sum(${conEdRequests.totalRequested}), 0)`,
            totalApproved: sql<string>`coalesce(sum(${conEdRequests.totalApproved}), 0)`,
            totalReimbursed: sql<string>`coalesce(sum(case when ${conEdRequests.status} = 'reimbursed' then coalesce(${reimbursements.amount}, ${conEdRequests.totalApproved}, ${conEdRequests.totalRequested}) else 0 end), 0)`,
            outstandingApproved: sql<string>`coalesce(sum(case when ${conEdRequests.status} in ('awaiting_receipt', 'receipt_submitted') then coalesce(${conEdRequests.totalApproved}, 0) else 0 end), 0)`,
          })
          .from(conEdRequests)
          .innerJoin(users, eq(conEdRequests.employeeId, users.id))
          .leftJoin(clinics, eq(users.clinicId, clinics.id))
          .leftJoin(reimbursements, eq(conEdRequests.id, reimbursements.requestId))
          .where(whereClause),
        db
          .select({
            status: conEdRequests.status,
            count: sql<number>`count(*)::int`,
            oldestAt: sql<Date>`min(${conEdRequests.updatedAt})`,
          })
          .from(conEdRequests)
          .innerJoin(users, eq(conEdRequests.employeeId, users.id))
          .leftJoin(clinics, eq(users.clinicId, clinics.id))
          .where(and(whereClause, inArray(conEdRequests.status, ACTIVE_STAGES.map((stage) => stage.status))))
          .groupBy(conEdRequests.status),
        reportBaseQuery()
          .where(whereClause)
          .orderBy(reportOrder(filters), desc(conEdRequests.id))
          .limit(filters.pageSize)
          .offset(offset),
      ]);

      const summaryRow = summaryRows[0];
      const workflowMap = new Map(workflowRows.map((row) => [row.status, row]));
      const now = Date.now();
      const workflow = ACTIVE_STAGES.map((stage) => {
        const row = workflowMap.get(stage.status);
        return {
          ...stage,
          count: row?.count ?? 0,
          oldestDays: row?.oldestAt
            ? Math.max(0, Math.floor((now - new Date(row.oldestAt).getTime()) / 86_400_000))
            : null,
        };
      });
      const total = summaryRow?.totalRequests ?? 0;

      res.json({
        summary: {
          totalRequests: total,
          totalRequested: Number(summaryRow?.totalRequested ?? 0),
          totalApproved: Number(summaryRow?.totalApproved ?? 0),
          totalReimbursed: Number(summaryRow?.totalReimbursed ?? 0),
          outstandingApproved: Number(summaryRow?.outstandingApproved ?? 0),
        },
        workflow,
        items: detailRows.map(formatRow),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      });
    } catch (err) {
      req.log.error({ err }, "getReport error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

function csvCell(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

router.get(
  "/reports/export",
  requireRole(...REPORT_ROLES),
  async (req: Request, res: Response) => {
    try {
      const parsed = ExportReportQueryParams.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid report filters" });
        return;
      }

      const filters = normalizeFilters({ ...parsed.data, page: 1, pageSize: 25 });
      const rows = await reportBaseQuery()
        .where(and(...reportConditions(req.dbUser!, filters)))
        .orderBy(reportOrder(filters), desc(conEdRequests.id));
      const formatted = rows.map(formatRow);
      const headers = [
        "Request ID", "Status", "Employee", "Employee Email", "Clinic", "Course",
        "Provider", "Course URL", "Start Date", "End Date", "Delivery Method",
        "Location", "Requested", "Approved", "Reimbursed", "Created",
        "Manager Decision", "Business Office Decision", "Paycheck Date",
      ];
      const lines = formatted.map((row) => [
        row.id, row.status, row.employeeName, row.employeeEmail, row.clinicName,
        row.courseName, row.courseProvider, row.courseUrl, row.courseStartDate,
        row.courseEndDate, row.deliveryMethod, row.location, row.totalRequested,
        row.totalApproved, row.reimbursementAmount, row.createdAt,
        row.managerDecisionAt, row.boDecisionAt, row.paycheckDate,
      ].map(csvCell).join(","));
      const csv = `\uFEFF${headers.map(csvCell).join(",")}\r\n${lines.join("\r\n")}`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="oss-ce-report-${filters.year}.csv"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(csv);
    } catch (err) {
      req.log.error({ err }, "exportReport error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
