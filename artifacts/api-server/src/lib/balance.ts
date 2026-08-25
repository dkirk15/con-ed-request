import { db } from "@workspace/db";
import { conEdAllocationOverrides, conEdRequests, reimbursements } from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getSettings } from "./settings";

const APPROVED_STATUSES = [
  "awaiting_receipt",
  "receipt_submitted",
  "reimbursed",
] as const;

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function parseMoney(value: string | null | undefined) {
  return parseFloat(value ?? "0");
}

export function calcAnnualAllocationForYear(
  hireDateStr: string | null,
  year: number,
  annualBudget: number = 2000,
): {
  allocation: number;
  isProrated: boolean;
  hireMonth: number | null;
} {
  if (!hireDateStr) {
    return { allocation: annualBudget, isProrated: false, hireMonth: null };
  }

  const hireDate = new Date(hireDateStr);
  const hireYear = hireDate.getFullYear();

  if (hireYear > year) {
    return { allocation: 0, isProrated: false, hireMonth: null };
  }

  if (hireYear < year) {
    return { allocation: annualBudget, isProrated: false, hireMonth: null };
  }

  const hireMonth = hireDate.getMonth() + 1;
  const allocation = roundCurrency((annualBudget * (13 - hireMonth)) / 12);

  return { allocation, isProrated: true, hireMonth };
}

export function calcAnnualAllocation(hireDateStr: string | null, annualBudget: number = 2000) {
  return calcAnnualAllocationForYear(hireDateStr, new Date().getFullYear(), annualBudget);
}

export async function getUserBalance(
  userId: number,
  hireDateStr: string | null,
  conEdAllocation?: number | null,
  requestedYear?: number,
) {
  const year = requestedYear ?? new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01`);
  const yearEnd = new Date(`${year + 1}-01-01`);

  const { annualBudget } = await getSettings();

  const calculated = calcAnnualAllocationForYear(hireDateStr, year, annualBudget);
  const yearOverride = await db
    .select({ allocation: conEdAllocationOverrides.allocation })
    .from(conEdAllocationOverrides)
    .where(and(
      eq(conEdAllocationOverrides.userId, userId),
      eq(conEdAllocationOverrides.year, year),
    ))
    .limit(1);
  const effectiveOverride = yearOverride[0]?.allocation != null
    ? parseMoney(yearOverride[0].allocation)
    : requestedYear == null ? conEdAllocation : null;
  const allocation = effectiveOverride != null ? effectiveOverride : calculated.allocation;
  const isProrated = effectiveOverride != null ? false : calculated.isProrated;
  const hireMonth = effectiveOverride != null ? null : calculated.hireMonth;

  const approvedRows = await db
    .select({
      createdAt: conEdRequests.createdAt,
      totalRequested: conEdRequests.totalRequested,
      totalApproved: conEdRequests.totalApproved,
      reimbursedAmount: reimbursements.amount,
    })
    .from(conEdRequests)
    .leftJoin(reimbursements, eq(reimbursements.requestId, conEdRequests.id))
    .where(
      and(
        eq(conEdRequests.employeeId, userId),
        inArray(conEdRequests.status, APPROVED_STATUSES),
      ),
    );

  const approvedByYear = new Map<number, number>();
  for (const row of approvedRows) {
    const approvedYear = row.createdAt.getFullYear();
    const amount = parseMoney(row.reimbursedAmount ?? row.totalApproved ?? row.totalRequested);
    approvedByYear.set(approvedYear, (approvedByYear.get(approvedYear) ?? 0) + amount);
  }

  const approvedYears = [...approvedByYear.keys()];
  const hireYear = hireDateStr ? new Date(hireDateStr).getFullYear() : year;
  const firstRelevantYear = Math.min(year, hireYear, ...approvedYears);
  const historicalOverrides = await db
    .select({
      year: conEdAllocationOverrides.year,
      allocation: conEdAllocationOverrides.allocation,
    })
    .from(conEdAllocationOverrides)
    .where(and(
      eq(conEdAllocationOverrides.userId, userId),
    sql`${conEdAllocationOverrides.year} < ${year}`,
    ));
  const allocationByYear = new Map(historicalOverrides.map((row) => [row.year, parseMoney(row.allocation)]));
  let carryoverDebt = 0;

  for (let balanceYear = firstRelevantYear; balanceYear < year; balanceYear += 1) {
    const yearAllocation = allocationByYear.get(balanceYear)
      ?? calcAnnualAllocationForYear(hireDateStr, balanceYear, annualBudget).allocation;
    const yearSpend = approvedByYear.get(balanceYear) ?? 0;
    carryoverDebt = Math.max(0, carryoverDebt + yearSpend - yearAllocation);
  }

  const availableAllocation = Math.max(0, allocation - carryoverDebt);
  const usedAmount = approvedByYear.get(year) ?? 0;

  const pendingRows = await db
    .select({ totalRequested: conEdRequests.totalRequested })
    .from(conEdRequests)
    .where(
      and(
        eq(conEdRequests.employeeId, userId),
        sql`${conEdRequests.createdAt} >= ${yearStart}`,
        sql`${conEdRequests.createdAt} < ${yearEnd}`,
        inArray(conEdRequests.status, ["pending_manager", "pending_bo"]),
      ),
    );

  let pendingAmount = 0;
  for (const row of pendingRows) {
    pendingAmount += parseMoney(row.totalRequested);
  }

  const remainingAmount = Math.max(0, availableAllocation - usedAmount);

  return {
    userId,
    annualAllocation: roundCurrency(allocation),
    availableAllocation: roundCurrency(availableAllocation),
    carryoverDebt: roundCurrency(carryoverDebt),
    usedAmount: roundCurrency(usedAmount),
    remainingAmount: roundCurrency(remainingAmount),
    pendingAmount: roundCurrency(pendingAmount),
    year,
    isProrated,
    hireMonth,
  };
}
