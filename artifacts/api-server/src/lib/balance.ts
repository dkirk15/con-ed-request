import { db } from "@workspace/db";
import { conEdRequests } from "@workspace/db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";

const ANNUAL_BUDGET = 2000;

export function calcAnnualAllocation(hireDateStr: string | null): {
  allocation: number;
  isProrated: boolean;
  hireMonth: number | null;
} {
  if (!hireDateStr) {
    return { allocation: ANNUAL_BUDGET, isProrated: false, hireMonth: null };
  }

  const hireDate = new Date(hireDateStr);
  const currentYear = new Date().getFullYear();
  const hireYear = hireDate.getFullYear();

  if (hireYear < currentYear) {
    return { allocation: ANNUAL_BUDGET, isProrated: false, hireMonth: null };
  }

  // First year: prorate by hire month (month 1-12, Jan = month 1)
  const hireMonth = hireDate.getMonth() + 1; // 1-indexed
  // Formula: $2000 × (13 - hireMonth) / 12
  const allocation = Math.round((ANNUAL_BUDGET * (13 - hireMonth)) / 12 * 100) / 100;

  return { allocation, isProrated: true, hireMonth };
}

export async function getUserBalance(userId: number, hireDateStr: string | null) {
  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01`);
  const { allocation, isProrated, hireMonth } = calcAnnualAllocation(hireDateStr);

  // Get all non-cancelled, non-denied requests for this year
  const rows = await db
    .select({
      status: conEdRequests.status,
      totalRequested: conEdRequests.totalRequested,
      totalApproved: conEdRequests.totalApproved,
    })
    .from(conEdRequests)
    .where(
      and(
        eq(conEdRequests.employeeId, userId),
        sql`${conEdRequests.createdAt} >= ${yearStart}`,
        or(
          inArray(conEdRequests.status, [
            "bo_approved",
            "awaiting_receipt",
            "receipt_submitted",
            "reimbursed",
          ]),
        ),
      ),
    );

  let usedAmount = 0;
  let pendingAmount = 0;

  for (const row of rows) {
    const approved = parseFloat(row.totalApproved ?? "0");
    const requested = parseFloat(row.totalRequested ?? "0");

    if (
      row.status === "reimbursed" ||
      row.status === "receipt_submitted" ||
      row.status === "awaiting_receipt"
    ) {
      usedAmount += approved || requested;
    } else if (row.status === "bo_approved") {
      pendingAmount += approved || requested;
    }
  }

  // Also count pending_manager and manager_approved as pending
  const pendingRows = await db
    .select({
      totalRequested: conEdRequests.totalRequested,
    })
    .from(conEdRequests)
    .where(
      and(
        eq(conEdRequests.employeeId, userId),
        sql`${conEdRequests.createdAt} >= ${yearStart}`,
        inArray(conEdRequests.status, ["pending_manager", "manager_approved", "pending_bo"]),
      ),
    );

  for (const row of pendingRows) {
    pendingAmount += parseFloat(row.totalRequested ?? "0");
  }

  const remainingAmount = Math.max(0, allocation - usedAmount);

  return {
    userId,
    annualAllocation: allocation,
    usedAmount: Math.round(usedAmount * 100) / 100,
    remainingAmount: Math.round(remainingAmount * 100) / 100,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    year,
    isProrated,
    hireMonth,
  };
}
