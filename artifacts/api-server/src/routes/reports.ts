import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  clinics,
  conEdAllocationOverrides,
  conEdRequests,
  receipts,
  reimbursements,
  repaymentGuarantees,
  users,
} from "@workspace/db/schema";
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
import { calcAnnualAllocationForYear, getHireDateParts } from "../lib/balance";
import { getSettings } from "../lib/settings";

const router: IRouter = Router();
const REPORT_ROLES = ["manager", "business_office", "accounting", "admin"] as const;
const APPROVED_STATUSES = ["awaiting_receipt", "receipt_submitted", "reimbursed"] as const;
const PENDING_STATUSES = ["pending_manager", "pending_bo"] as const;
const ACTIVE_STAGES = [
  { status: "pending_manager", label: "Manager approval" },
  { status: "pending_bo", label: "CE approval" },
  { status: "awaiting_receipt", label: "Awaiting receipt" },
  { status: "receipt_submitted", label: "Ready to reimburse" },
] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ReportUser = NonNullable<Request["dbUser"]>;
type ParsedReportFilters = ReturnType<typeof GetReportQueryParams.parse>;
type ReportFilters = Omit<ParsedReportFilters, "year" | "view" | "dateBasis"> & {
  year: number;
  view: NonNullable<ParsedReportFilters["view"]>;
  dateBasis: NonNullable<ParsedReportFilters["dateBasis"]>;
};

function normalizeFilters(filters: ParsedReportFilters): ReportFilters {
  return {
    ...filters,
    year: filters.year ?? new Date().getFullYear(),
    view: filters.view ?? "all",
    dateBasis: filters.dateBasis ?? "request",
  };
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function money(value: string | null | undefined) {
  return Number(value ?? 0);
}

function dateRange(filters: ReportFilters) {
  const from = filters.dateFrom ?? `${filters.year}-01-01`;
  const to = filters.dateTo ?? `${filters.year}-12-31`;
  const fromDate = new Date(`${from}T00:00:00`);
  const throughDate = new Date(`${to}T23:59:59.999`);
  return { from, to, fromDate, throughDate };
}

function scopeConditions(user: ReportUser, filters: ReportFilters): SQL[] {
  const conditions: SQL[] = [];
  if (user.role === "manager") {
    conditions.push(user.clinicId ? eq(users.clinicId, user.clinicId) : sql`false`);
  } else if (filters.clinicId != null) {
    conditions.push(eq(users.clinicId, filters.clinicId));
  }
  if (filters.employeeId != null) conditions.push(eq(conEdRequests.employeeId, filters.employeeId));
  return conditions;
}

function detailConditions(filters: ReportFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(conEdRequests.status, filters.status));
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

function reportDateCondition(filters: ReportFilters): SQL {
  const range = dateRange(filters);
  if (filters.dateBasis === "course") {
    return and(
      gte(conEdRequests.courseEndDate, range.from),
      lte(conEdRequests.courseStartDate, range.to),
    )!;
  }
  if (filters.dateBasis === "approval") {
    const approvalDate = sql<Date>`coalesce(
      ${conEdRequests.boApprovedAt},
      ${conEdRequests.boDeniedAt},
      ${conEdRequests.managerApprovedAt},
      ${conEdRequests.managerDeniedAt}
    )`;
    return and(gte(approvalDate, range.fromDate), lte(approvalDate, range.throughDate))!;
  }
  if (filters.dateBasis === "reimbursement") {
    return and(
      gte(reimbursements.paycheckDate, range.from),
      lte(reimbursements.paycheckDate, range.to),
    )!;
  }
  return and(
    gte(conEdRequests.createdAt, range.fromDate),
    lte(conEdRequests.createdAt, range.throughDate),
  )!;
}

function viewCondition(user: ReportUser, filters: ReportFilters): SQL | undefined {
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  switch (filters.view) {
    case "needs_attention":
      return or(
        and(inArray(conEdRequests.status, PENDING_STATUSES), lte(conEdRequests.updatedAt, threeDaysAgo)),
        and(eq(conEdRequests.status, "receipt_submitted"), lte(conEdRequests.updatedAt, threeDaysAgo)),
        and(eq(conEdRequests.status, "awaiting_receipt"), lte(conEdRequests.courseEndDate, sevenDaysAgo.toISOString().slice(0, 10))),
        and(eq(conEdRequests.requiresRepaymentGuarantee, true), eq(conEdRequests.status, "draft")),
        sql`${users.clinicId} is null`,
      );
    case "needs_approval":
      if (user.role === "manager") return eq(conEdRequests.status, "pending_manager");
      if (user.role === "business_office") return eq(conEdRequests.status, "pending_bo");
      return inArray(conEdRequests.status, PENDING_STATUSES);
    case "awaiting_receipts":
      return eq(conEdRequests.status, "awaiting_receipt");
    case "ready_to_pay":
      return eq(conEdRequests.status, "receipt_submitted");
    case "advanced_funding":
      return eq(conEdRequests.requiresRepaymentGuarantee, true);
    case "paycheck_history":
      return eq(conEdRequests.status, "reimbursed");
    default:
      return undefined;
  }
}

function reportConditions(user: ReportUser, filters: ReportFilters): SQL[] {
  const conditions = [
    ...scopeConditions(user, filters),
    ...detailConditions(filters),
    reportDateCondition(filters),
  ];
  const view = viewCondition(user, filters);
  if (view) conditions.push(view);
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
  reimbursementMarkedAt: reimbursements.markedAt,
  managerApprovedAt: conEdRequests.managerApprovedAt,
  managerDeniedAt: conEdRequests.managerDeniedAt,
  boApprovedAt: conEdRequests.boApprovedAt,
  boDeniedAt: conEdRequests.boDeniedAt,
  requiresRepaymentGuarantee: conEdRequests.requiresRepaymentGuarantee,
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

type ReportSelectionRow = Awaited<ReturnType<typeof reportBaseQuery>>[number];

function reimbursementAmount(row: ReportSelectionRow) {
  if (row.reimbursementAmount != null) return money(row.reimbursementAmount);
  return row.status === "reimbursed" ? money(row.totalApproved ?? row.totalRequested) : 0;
}

function formatRow(row: ReportSelectionRow) {
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
    totalRequested: money(row.totalRequested),
    totalApproved: row.totalApproved == null ? null : money(row.totalApproved),
    reimbursementAmount: row.reimbursementAmount == null
      ? fallbackReimbursement == null ? null : money(fallbackReimbursement)
      : money(row.reimbursementAmount),
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

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

function daysBetween(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
}

async function buildBudgetUsage(user: ReportUser, filters: ReportFilters) {
  const employeeConditions: SQL[] = [inArray(users.role, ["employee", "manager"] as const)];
  if (user.role === "manager") {
    employeeConditions.push(user.clinicId ? eq(users.clinicId, user.clinicId) : sql`false`);
  } else if (filters.clinicId != null) {
    employeeConditions.push(eq(users.clinicId, filters.clinicId));
  }
  if (filters.employeeId != null) employeeConditions.push(eq(users.id, filters.employeeId));

  const employeeRows = await db
    .select({
      id: users.id,
      name: users.name,
      clinicId: users.clinicId,
      clinicName: clinics.name,
      hireDate: users.hireDate,
      allocationOverride: users.conEdAllocation,
    })
    .from(users)
    .leftJoin(clinics, eq(users.clinicId, clinics.id))
    .where(and(...employeeConditions))
    .orderBy(asc(users.name));

  if (employeeRows.length === 0) return { rows: [], advancedRequests: [] };
  const employeeIds = employeeRows.map((employee) => employee.id);
  const yearEnd = new Date(`${filters.year + 1}-01-01T00:00:00`);
  const { annualBudget } = await getSettings();

  const [fundingRows, overrideRows, guaranteeRows] = await Promise.all([
    db
      .select({
        employeeId: conEdRequests.employeeId,
        status: conEdRequests.status,
        createdAt: conEdRequests.createdAt,
        totalRequested: conEdRequests.totalRequested,
        totalApproved: conEdRequests.totalApproved,
        reimbursementAmount: reimbursements.amount,
      })
      .from(conEdRequests)
      .leftJoin(reimbursements, eq(conEdRequests.id, reimbursements.requestId))
      .where(and(
        inArray(conEdRequests.employeeId, employeeIds),
        lt(conEdRequests.createdAt, yearEnd),
        inArray(conEdRequests.status, [...APPROVED_STATUSES, ...PENDING_STATUSES]),
      )),
    db
      .select({
        userId: conEdAllocationOverrides.userId,
        year: conEdAllocationOverrides.year,
        allocation: conEdAllocationOverrides.allocation,
      })
      .from(conEdAllocationOverrides)
      .where(inArray(conEdAllocationOverrides.userId, employeeIds)),
    db
      .select({
        requestId: conEdRequests.id,
        employeeId: conEdRequests.employeeId,
        employeeName: users.name,
        clinicName: clinics.name,
        status: conEdRequests.status,
        requestedAmount: conEdRequests.totalRequested,
        signedAt: repaymentGuarantees.signedAt,
      })
      .from(conEdRequests)
      .innerJoin(users, eq(conEdRequests.employeeId, users.id))
      .leftJoin(clinics, eq(users.clinicId, clinics.id))
      .leftJoin(repaymentGuarantees, eq(conEdRequests.id, repaymentGuarantees.requestId))
      .where(and(
        inArray(conEdRequests.employeeId, employeeIds),
        eq(conEdRequests.requiresRepaymentGuarantee, true),
        gte(conEdRequests.createdAt, new Date(`${filters.year}-01-01T00:00:00`)),
        lt(conEdRequests.createdAt, yearEnd),
      ))
      .orderBy(desc(conEdRequests.createdAt)),
  ]);

  const overridesByEmployee = new Map<number, Map<number, number>>();
  for (const row of overrideRows) {
    const overrides = overridesByEmployee.get(row.userId) ?? new Map<number, number>();
    overrides.set(row.year, money(row.allocation));
    overridesByEmployee.set(row.userId, overrides);
  }

  const fundingByEmployee = new Map<number, typeof fundingRows>();
  for (const row of fundingRows) {
    const list = fundingByEmployee.get(row.employeeId) ?? [];
    list.push(row);
    fundingByEmployee.set(row.employeeId, list);
  }
  const guaranteesByEmployee = new Map<number, typeof guaranteeRows>();
  for (const row of guaranteeRows) {
    const list = guaranteesByEmployee.get(row.employeeId) ?? [];
    if (!list.some((item) => item.requestId === row.requestId)) list.push(row);
    guaranteesByEmployee.set(row.employeeId, list);
  }

  const rows = employeeRows.map((employee) => {
    const employeeFunding = fundingByEmployee.get(employee.id) ?? [];
    const approvedByYear = new Map<number, number>();
    let pendingAmount = 0;
    for (const row of employeeFunding) {
      const requestYear = row.createdAt.getFullYear();
      if (APPROVED_STATUSES.includes(row.status as typeof APPROVED_STATUSES[number])) {
        const amount = money(row.reimbursementAmount ?? row.totalApproved ?? row.totalRequested);
        approvedByYear.set(requestYear, (approvedByYear.get(requestYear) ?? 0) + amount);
      } else if (requestYear === filters.year) {
        pendingAmount += money(row.totalRequested);
      }
    }

    const hireDateParts = employee.hireDate ? getHireDateParts(employee.hireDate) : null;
    const hireYear = hireDateParts?.isValid ? hireDateParts.year : filters.year;
    const approvedYears = [...approvedByYear.keys()];
    const firstRelevantYear = Math.min(filters.year, hireYear, ...approvedYears);
    const overrides = overridesByEmployee.get(employee.id) ?? new Map<number, number>();
    // The legacy column predates year-scoped overrides. Treat it as a current-year
    // value only, so changing it cannot alter historical carry-forward debt.
    if (employee.allocationOverride != null && !overrides.has(filters.year)) {
      overrides.set(filters.year, money(employee.allocationOverride));
    }
    let carryoverDebt = 0;
    for (let year = firstRelevantYear; year < filters.year; year += 1) {
      const allocation = overrides.get(year)
        ?? calcAnnualAllocationForYear(employee.hireDate, year, annualBudget).allocation;
      carryoverDebt = Math.max(0, carryoverDebt + (approvedByYear.get(year) ?? 0) - allocation);
    }

    const calculated = calcAnnualAllocationForYear(employee.hireDate, filters.year, annualBudget);
    const annualAllocation = overrides.get(filters.year) ?? calculated.allocation;
    const availableAllocation = Math.max(0, annualAllocation - carryoverDebt);
    const usedAmount = approvedByYear.get(filters.year) ?? 0;
    const remainingAmount = Math.max(0, availableAllocation - usedAmount);
    const advancedExposure = Math.max(0, usedAmount + pendingAmount - availableAllocation);
    const guarantees = guaranteesByEmployee.get(employee.id) ?? [];

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      clinicId: employee.clinicId ?? null,
      clinicName: employee.clinicName ?? null,
      annualAllocation: roundCurrency(annualAllocation),
      availableAllocation: roundCurrency(availableAllocation),
      carryoverDebt: roundCurrency(carryoverDebt),
      usedAmount: roundCurrency(usedAmount),
      pendingAmount: roundCurrency(pendingAmount),
      remainingAmount: roundCurrency(remainingAmount),
      advancedExposure: roundCurrency(advancedExposure),
      guaranteeRequestCount: guarantees.length,
      unsignedGuaranteeCount: guarantees.filter((guarantee) => !guarantee.signedAt).length,
    };
  }).sort((a, b) =>
    b.advancedExposure - a.advancedExposure
    || b.carryoverDebt - a.carryoverDebt
    || a.employeeName.localeCompare(b.employeeName),
  );

  const advancedRequests = guaranteeRows
    .filter((row, index, all) => all.findIndex((item) => item.requestId === row.requestId) === index)
    .map((row) => ({
      requestId: row.requestId,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      clinicName: row.clinicName ?? null,
      status: row.status,
      requestedAmount: money(row.requestedAmount),
      guaranteeSigned: Boolean(row.signedAt),
      guaranteeSignedAt: row.signedAt?.toISOString() ?? null,
    }));
  return { rows, advancedRequests };
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

      // NOTE: groupBy (not selectDistinct) is required here because PostgreSQL
      // rejects "SELECT DISTINCT … ORDER BY expr" when the ORDER BY expression
      // is not in the select list.  The year column is in our SELECT, so
      // GROUP BY + ORDER BY works correctly and avoids the SQL error.
      const [yearRows, clinicRows, employeeRows] = await Promise.all([
        db
          .select({ year: sql<number>`extract(year from ${conEdRequests.createdAt})::int` })
          .from(conEdRequests)
          .innerJoin(users, eq(conEdRequests.employeeId, users.id))
          .where(roleCondition)
          .groupBy(sql`extract(year from ${conEdRequests.createdAt})::int`)
          .orderBy(desc(sql`extract(year from ${conEdRequests.createdAt})::int`)),
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

      const user = req.dbUser!;
      const filters = normalizeFilters(parsed.data);
      const whereClause = and(...reportConditions(user, filters));
      const unviewedWhere = and(
        ...scopeConditions(user, filters),
        ...detailConditions(filters),
        reportDateCondition(filters),
      );
      const offset = (filters.page - 1) * filters.pageSize;
      const eventYearStart = new Date(`${filters.year}-01-01T00:00:00`);
      const eventYearEnd = new Date(`${filters.year + 1}-01-01T00:00:00`);

      const [
        summaryRows,
        detailRows,
        operationalRows,
        trendRows,
        receiptTimingRows,
        budget,
      ] = await Promise.all([
        db
          .select({
            totalRequests: sql<number>`count(*)::int`,
            totalRequested: sql<string>`coalesce(sum(${conEdRequests.totalRequested}), 0)`,
            totalApproved: sql<string>`coalesce(sum(${conEdRequests.totalApproved}), 0)`,
            totalReimbursed: sql<string>`coalesce(sum(case when ${conEdRequests.status} = 'reimbursed' then coalesce(${reimbursements.amount}, ${conEdRequests.totalApproved}, ${conEdRequests.totalRequested}) else 0 end), 0)`,
            outstandingApproved: sql<string>`coalesce(sum(case when ${conEdRequests.status} in ('awaiting_receipt', 'receipt_submitted') then coalesce(${conEdRequests.totalApproved}, 0) else 0 end), 0)`,
            totalPending: sql<string>`coalesce(sum(case when ${conEdRequests.status} in ('pending_manager', 'pending_bo') then ${conEdRequests.totalRequested} else 0 end), 0)`,
          })
          .from(conEdRequests)
          .innerJoin(users, eq(conEdRequests.employeeId, users.id))
          .leftJoin(clinics, eq(users.clinicId, clinics.id))
          .leftJoin(reimbursements, eq(conEdRequests.id, reimbursements.requestId))
          .where(whereClause),
        reportBaseQuery()
          .where(whereClause)
          .orderBy(reportOrder(filters), desc(conEdRequests.id))
          .limit(filters.pageSize)
          .offset(offset),
        db
          .select({
            ...reportSelection,
            guaranteeId: repaymentGuarantees.id,
          })
          .from(conEdRequests)
          .innerJoin(users, eq(conEdRequests.employeeId, users.id))
          .leftJoin(clinics, eq(users.clinicId, clinics.id))
          .leftJoin(reimbursements, eq(conEdRequests.id, reimbursements.requestId))
          .leftJoin(repaymentGuarantees, eq(conEdRequests.id, repaymentGuarantees.requestId))
          .where(unviewedWhere),
        reportBaseQuery()
          .where(and(
            ...scopeConditions(user, filters),
            ...detailConditions(filters),
            or(
              and(gte(conEdRequests.createdAt, eventYearStart), lt(conEdRequests.createdAt, eventYearEnd)),
              and(gte(conEdRequests.boApprovedAt, eventYearStart), lt(conEdRequests.boApprovedAt, eventYearEnd)),
              and(gte(conEdRequests.managerApprovedAt, eventYearStart), lt(conEdRequests.managerApprovedAt, eventYearEnd)),
              and(gte(reimbursements.markedAt, eventYearStart), lt(reimbursements.markedAt, eventYearEnd)),
            ),
          )),
        db
          .select({
            requestId: conEdRequests.id,
            receiptUploadedAt: receipts.uploadedAt,
            reimbursementMarkedAt: reimbursements.markedAt,
          })
          .from(conEdRequests)
          .innerJoin(users, eq(conEdRequests.employeeId, users.id))
          .leftJoin(clinics, eq(users.clinicId, clinics.id))
          .innerJoin(receipts, eq(conEdRequests.id, receipts.requestId))
          .innerJoin(reimbursements, eq(conEdRequests.id, reimbursements.requestId))
          .where(and(
            ...scopeConditions(user, filters),
            gte(reimbursements.markedAt, eventYearStart),
            lt(reimbursements.markedAt, eventYearEnd),
          )),
        buildBudgetUsage(user, filters),
      ]);

      const summaryRow = summaryRows[0];
      const total = summaryRow?.totalRequests ?? 0;
      const now = Date.now();
      const uniqueOperationalRows = operationalRows.filter((row, index, all) =>
        all.findIndex((item) => item.id === row.id) === index,
      );
      const ageDays = (date: Date) => Math.max(0, Math.floor((now - date.getTime()) / 86_400_000));

      const staleApprovals = uniqueOperationalRows.filter((row) =>
        PENDING_STATUSES.includes(row.status as typeof PENDING_STATUSES[number]) && ageDays(row.updatedAt) >= 3,
      );
      const overdueReceipts = uniqueOperationalRows.filter((row) =>
        row.status === "awaiting_receipt"
        && row.courseEndDate
        && new Date(`${row.courseEndDate}T23:59:59`).getTime() <= now - 7 * 86_400_000,
      );
      const staleReimbursements = uniqueOperationalRows.filter((row) =>
        row.status === "receipt_submitted" && ageDays(row.updatedAt) >= 3,
      );
      const missingGuarantees = uniqueOperationalRows.filter((row) =>
        row.requiresRepaymentGuarantee && !row.guaranteeId,
      );
      const missingClinics = uniqueOperationalRows.filter((row) => row.clinicId == null);
      const legacyReimbursements = uniqueOperationalRows.filter((row) =>
        row.status === "reimbursed" && row.reimbursementAmount == null,
      );

      const exceptions = [
        {
          id: "stale_approvals" as const,
          label: "Approval follow-up",
          description: "Approval requests waiting at least 3 days.",
          count: staleApprovals.length,
          severity: staleApprovals.some((row) => ageDays(row.updatedAt) >= 7) ? "follow_up" as const : "attention" as const,
          view: "needs_attention" as const,
        },
        {
          id: "overdue_receipts" as const,
          label: "Receipts overdue",
          description: "Courses ended at least 7 days ago without a receipt.",
          count: overdueReceipts.length,
          severity: overdueReceipts.some((row) => row.courseEndDate && ageDays(new Date(`${row.courseEndDate}T00:00:00`)) >= 30) ? "follow_up" as const : "attention" as const,
          view: "awaiting_receipts" as const,
        },
        {
          id: "stale_reimbursements" as const,
          label: "Payments waiting",
          description: "Complete receipts waiting at least 3 days for reimbursement.",
          count: staleReimbursements.length,
          severity: staleReimbursements.some((row) => ageDays(row.updatedAt) >= 7) ? "follow_up" as const : "attention" as const,
          view: "ready_to_pay" as const,
        },
        {
          id: "missing_guarantees" as const,
          label: "Guarantees missing",
          description: "Advanced-funding requests without a signed repayment guarantee.",
          count: missingGuarantees.length,
          severity: "follow_up" as const,
          view: "advanced_funding" as const,
        },
        {
          id: "missing_clinics" as const,
          label: "Clinic assignment missing",
          description: "Requests belonging to employees without a clinic assignment.",
          count: missingClinics.length,
          severity: "attention" as const,
          view: "needs_attention" as const,
        },
        {
          id: "legacy_reimbursements" as const,
          label: "Payment amount missing",
          description: "Older reimbursements using an approved-amount fallback.",
          count: legacyReimbursements.length,
          severity: "attention" as const,
          view: "paycheck_history" as const,
        },
      ].filter((item) => item.count > 0);

      const workflow = ACTIVE_STAGES.map((stage) => {
        const rows = uniqueOperationalRows.filter((row) => row.status === stage.status);
        const oldest = rows.length ? Math.max(...rows.map((row) => ageDays(row.updatedAt))) : null;
        return { ...stage, count: rows.length, oldestDays: oldest };
      });

      const trend = Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: MONTH_LABELS[index],
        requested: 0,
        approved: 0,
        reimbursed: 0,
      }));
      for (const row of trendRows) {
        if (row.createdAt.getFullYear() === filters.year) {
          trend[row.createdAt.getMonth()].requested += money(row.totalRequested);
        }
        if (row.boApprovedAt?.getFullYear() === filters.year) {
          trend[row.boApprovedAt.getMonth()].approved += money(row.totalApproved ?? row.totalRequested);
        }
        const paidDate = row.paycheckDate ? new Date(`${row.paycheckDate}T00:00:00`) : null;
        if (paidDate?.getFullYear() === filters.year) {
          trend[paidDate.getMonth()].reimbursed += reimbursementAmount(row);
        }
      }
      const monthlyTrend = trend.map((item) => ({
        ...item,
        requested: roundCurrency(item.requested),
        approved: roundCurrency(item.approved),
        reimbursed: roundCurrency(item.reimbursed),
      }));

      const managerDurations = trendRows
        .map((row) => daysBetween(row.createdAt, row.managerApprovedAt ?? row.managerDeniedAt))
        .filter((value): value is number => value != null);
      const boDurations = trendRows
        .map((row) => daysBetween(row.managerApprovedAt, row.boApprovedAt ?? row.boDeniedAt))
        .filter((value): value is number => value != null);
      const reimbursementDurations = receiptTimingRows
        .map((row) => daysBetween(row.receiptUploadedAt, row.reimbursementMarkedAt))
        .filter((value): value is number => value != null);
      const turnaround = [
        { stage: "manager_approval" as const, label: "Manager decision", values: managerDurations },
        { stage: "business_office" as const, label: "Business Office decision", values: boDurations },
        { stage: "reimbursement" as const, label: "Receipt to paycheck", values: reimbursementDurations },
      ].map(({ values, ...item }) => ({
        ...item,
        medianDays: percentile(values, 0.5),
        p90Days: percentile(values, 0.9),
        sampleSize: values.length,
      }));

      const paycheckMap = new Map<string, { reimbursementCount: number; totalAmount: number }>();
      for (const row of trendRows) {
        if (!row.paycheckDate) continue;
        const paidDate = new Date(`${row.paycheckDate}T00:00:00`);
        if (paidDate.getFullYear() !== filters.year) continue;
        const batch = paycheckMap.get(row.paycheckDate) ?? { reimbursementCount: 0, totalAmount: 0 };
        batch.reimbursementCount += 1;
        batch.totalAmount += reimbursementAmount(row);
        paycheckMap.set(row.paycheckDate, batch);
      }
      const paycheckLedger = [...paycheckMap.entries()]
        .map(([paycheckDate, batch]) => ({ paycheckDate, ...batch, totalAmount: roundCurrency(batch.totalAmount) }))
        .sort((a, b) => b.paycheckDate.localeCompare(a.paycheckDate));

      const clinicMap = new Map<number | null, {
        clinicId: number | null;
        clinicName: string;
        requestCount: number;
        requested: number;
        approved: number;
        reimbursed: number;
        denialCount: number;
        submittedCount: number;
      }>();
      if (user.role === "admin") {
        for (const row of trendRows.filter((item) => item.createdAt.getFullYear() === filters.year)) {
          const key = row.clinicId ?? null;
          const clinic = clinicMap.get(key) ?? {
            clinicId: key,
            clinicName: row.clinicName ?? "Unassigned",
            requestCount: 0,
            requested: 0,
            approved: 0,
            reimbursed: 0,
            denialCount: 0,
            submittedCount: 0,
          };
          clinic.requestCount += 1;
          clinic.requested += money(row.totalRequested);
          clinic.approved += money(row.totalApproved);
          clinic.reimbursed += reimbursementAmount(row);
          if (!["draft", "cancelled"].includes(row.status)) clinic.submittedCount += 1;
          if (["manager_denied", "bo_denied"].includes(row.status)) clinic.denialCount += 1;
          clinicMap.set(key, clinic);
        }
      }
      const clinicComparison = [...clinicMap.values()]
        .map((clinic) => ({
          clinicId: clinic.clinicId,
          clinicName: clinic.clinicName,
          requestCount: clinic.requestCount,
          requested: roundCurrency(clinic.requested),
          approved: roundCurrency(clinic.approved),
          reimbursed: roundCurrency(clinic.reimbursed),
          denialCount: clinic.denialCount,
          denialRate: clinic.submittedCount ? roundCurrency((clinic.denialCount / clinic.submittedCount) * 100) : 0,
        }))
        .sort((a, b) => b.requestCount - a.requestCount || a.clinicName.localeCompare(b.clinicName));

      const needsAttentionIds = new Set([
        ...staleApprovals,
        ...overdueReceipts,
        ...staleReimbursements,
        ...missingGuarantees,
        ...missingClinics,
      ].map((row) => row.id));
      const roleApprovalStatus = user.role === "manager"
        ? ["pending_manager"]
        : user.role === "business_office"
          ? ["pending_bo"]
          : [...PENDING_STATUSES];
      const quickViewDefinitions = [
        { id: "all" as const, label: "All activity", description: "Every request in this reporting period.", count: uniqueOperationalRows.length },
        { id: "needs_attention" as const, label: "Needs attention", description: "Aging or incomplete work that needs follow-up.", count: needsAttentionIds.size },
        { id: "needs_approval" as const, label: "Needs approval", description: "Requests waiting for an approval decision.", count: uniqueOperationalRows.filter((row) => roleApprovalStatus.includes(row.status)).length },
        { id: "awaiting_receipts" as const, label: "Awaiting receipts", description: "Approved courses that do not yet have a receipt.", count: uniqueOperationalRows.filter((row) => row.status === "awaiting_receipt").length },
        { id: "ready_to_pay" as const, label: "Ready to pay", description: "Submitted receipts ready for Accounting.", count: uniqueOperationalRows.filter((row) => row.status === "receipt_submitted").length },
        { id: "advanced_funding" as const, label: "Advanced funding", description: "Requests that require a repayment guarantee.", count: budget.advancedRequests.length },
        { id: "paycheck_history" as const, label: "Paycheck history", description: "Requests with a recorded reimbursement.", count: uniqueOperationalRows.filter((row) => row.status === "reimbursed").length },
      ];
      const quickViewsByRole = {
        manager: ["all", "needs_attention", "needs_approval", "awaiting_receipts", "advanced_funding"],
        business_office: ["all", "needs_attention", "needs_approval", "advanced_funding", "awaiting_receipts"],
        accounting: ["all", "needs_attention", "ready_to_pay", "paycheck_history"],
        admin: ["all", "needs_attention", "needs_approval", "awaiting_receipts", "ready_to_pay", "advanced_funding", "paycheck_history"],
      } as const;
      const roleQuickViews = user.role === "employee" ? ["all"] : quickViewsByRole[user.role];
      const roleQuickViewIds = new Set<string>(roleQuickViews);
      const quickViews = quickViewDefinitions.filter((item) => roleQuickViewIds.has(item.id));

      const totalAvailableAllocation = budget.rows.reduce((sum, row) => sum + row.availableAllocation, 0);
      const totalCarryoverDebt = budget.rows.reduce((sum, row) => sum + row.carryoverDebt, 0);
      const advancedExposure = budget.rows.reduce((sum, row) => sum + row.advancedExposure, 0);

      res.json({
        summary: {
          totalRequests: total,
          totalRequested: money(summaryRow?.totalRequested),
          totalApproved: money(summaryRow?.totalApproved),
          totalReimbursed: money(summaryRow?.totalReimbursed),
          outstandingApproved: money(summaryRow?.outstandingApproved),
          totalPending: money(summaryRow?.totalPending),
          totalAvailableAllocation: roundCurrency(totalAvailableAllocation),
          totalCarryoverDebt: roundCurrency(totalCarryoverDebt),
          advancedExposure: roundCurrency(advancedExposure),
        },
        workflow,
        quickViews,
        exceptions,
        monthlyTrend,
        turnaround,
        budgetUsage: budget.rows,
        advancedRequests: budget.advancedRequests,
        paycheckLedger,
        clinicComparison,
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
        "Provider", "Course URL", "Start Date", "End Date", "Location",
        "Requested", "Approved", "Reimbursed", "Created",
        "Manager Decision", "Business Office Decision", "Paycheck Date",
      ];
      const lines = formatted.map((row) => [
        row.id, row.status, row.employeeName, row.employeeEmail, row.clinicName,
        row.courseName, row.courseProvider, row.courseUrl, row.courseStartDate,
        row.courseEndDate, row.location, row.totalRequested, row.totalApproved,
        row.reimbursementAmount, row.createdAt, row.managerDecisionAt,
        row.boDecisionAt, row.paycheckDate,
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
