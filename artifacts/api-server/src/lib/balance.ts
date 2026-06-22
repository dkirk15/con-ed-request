import { db } from "@workspace/db";
import { conEdRequests } from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

const ANNUAL_BUDGET = 2000;
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
): {
  allocation: number;
  isProrated: boolean;
  hireMonth: number | null;
} {
  if (!hireDateStr) {
    return { allocation: ANNUAL_BUDGET, isProrated: false, hireMonth: null };
  }

  const hireDate = new Date(hireDateStr);
  const hireYear = hireDate.getFullYear();

  if (hireYear > year) {
    return { allocation: 0, isProrated: false, hireMonth: null };
  }

  if (hireYear < year) {
    return { allocation: ANNUAL_BUDGET, isProrated: false, hireMonth: null };
  }

  const hireMonth = hireDate.getMonth() + 1;
  const allocation = roundCurrency((ANNUAL_BUDGET * (13 - hireMonth)) / 12);

  return { allocation, isProrated: true, hireMonth };
}

export function calcAnnualAllocation(hireDateStr: string | null) {
  return calcAnnualAllocationForYear(hireDateStr, new Date().getFullYear());
}

export async function getUserBalance(userId: number, hireDateStr: string | null) {
  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01`);
  const { allocation, isProrated, hireMonth } = calcAnnualAllocation(hireDateStr);

  const approvedRows = await db
    .select({
      createdAt: conEdRequests.createdAt,
      totalRequested: conEdRequests.totalRequested,
      totalApproved: conEdRequests.totalApproved,
    })
    .from(conEdRequests)
    .where(
      and(
        eq(conEdRequests.employeeId, userId),
        inArray(conEdRequests.status, APPROVED_STATUSES),
      ),
    );

  const approvedByYear = new Map<number, number>();
  for (const row of approvedRows) {
    const approvedYear = row.createdAt.getFullYear();
    const amount = parseMoney(row.totalApproved ?? row.totalRequested);
    approvedByYear.set(approvedYear, (approvedByYear.get(approvedYear) ?? 0) + amount);
  }

  const approvedYears = [...approvedByYear.keys()];
  const hireYear = hireDateStr ? new Date(hireDateStr).getFullYear() : year;
  const firstRelevantYear = Math.min(year, hireYear, ...approvedYears);
  let carryoverDebt = 0;

  for (let balanceYear = firstRelevantYear; balanceYear < year; balanceYear += 1) {
    const yearAllocation = calcAnnualAllocationForYear(hireDateStr, balanceYear).allocation;
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
