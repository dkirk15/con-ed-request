import { test, expect } from "./fixtures";
import {
  createClinic,
  insertRequest,
  updateUserAllocation,
} from "./helpers/db";

const year = new Date().getFullYear();

async function getJson(
  page: import("@playwright/test").Page,
  path: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  await page.waitForFunction(() => Boolean(
    (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
  ));
  return page.evaluate(async (requestPath) => {
    const token = await (window as Window & {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk?.session?.getToken();
    const response = await fetch(requestPath, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return { status: response.status, data: await response.json() };
  }, path);
}

test("employee balance uses yearly overrides and submission uses the same allocation", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Balance-Override-${Date.now()}`);
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    hireDate: `${year - 2}-01-01`,
  });

  // The prior-year override creates $500 of debt: $3,500 spend - $3,000 allocation.
  // The current-year override then determines the current available balance.
  await updateUserAllocation(employee.dbId, 3000, year - 1);
  await updateUserAllocation(employee.dbId, 4000, year);
  await insertRequest({
    employeeId: employee.dbId,
    status: "reimbursed",
    courseNames: "E2E Historical Override Spend",
    totalRequested: 3500,
    totalApproved: 3500,
    createdAt: new Date(`${year - 1}-06-15T12:00:00Z`),
  });

  await signInAs(employee);
  const currentWithOverride = await getJson(page, `/api/users/${employee.dbId}/balance`);
  expect(currentWithOverride.status).toBe(200);
  expect(currentWithOverride.data).toMatchObject({
    annualAllocation: 4000,
    availableAllocation: 3500,
    carryoverDebt: 500,
    remainingAmount: 3500,
  });

  const dashboard = await getJson(page, "/api/dashboard/employee");
  expect(dashboard.status).toBe(200);
  expect(dashboard.data.balance).toMatchObject({
    annualAllocation: 4000,
    availableAllocation: 3500,
    carryoverDebt: 500,
    remainingAmount: 3500,
  });

  const priorYear = await getJson(page, `/api/users/${employee.dbId}/balance?year=${year - 1}`);
  expect(priorYear.status).toBe(200);
  expect(priorYear.data).toMatchObject({
    annualAllocation: 3000,
    usedAmount: 3500,
    remainingAmount: 0,
    carryoverDebt: 0,
  });

  // A $2,000 draft is within the $3,500 balance while the current override is $4,000.
  // Clearing that override drops the balance to $1,500 without changing prior debt,
  // so submission must require a guarantee.
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    status: "draft",
    courseNames: "E2E Override Submission Check",
    courseProvider: "E2E Provider",
    courseStartDate: `${year}-10-01`,
    courseEndDate: `${year}-10-02`,
    deliveryMethod: "virtual",
    totalRequested: 2000,
    tuition: 2000,
  });

  await updateUserAllocation(employee.dbId, 5000, year);
  const updatedOverride = await getJson(page, `/api/users/${employee.dbId}/balance`);
  expect(updatedOverride.data).toMatchObject({
    annualAllocation: 5000,
    carryoverDebt: 500,
    remainingAmount: 4500,
  });

  await updateUserAllocation(employee.dbId, null, year);
  const clearedOverride = await getJson(page, `/api/users/${employee.dbId}/balance`);
  expect(clearedOverride.data).toMatchObject({
    annualAllocation: 2000,
    carryoverDebt: 500,
    remainingAmount: 1500,
  });

  const rejectedSubmission = await page.evaluate(async (id) => {
    const token = await (window as Window & {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk?.session?.getToken();
    const response = await fetch(`/api/requests/${id}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, data: await response.json() };
  }, requestId);
  expect(rejectedSubmission.status).toBe(400);
  expect(rejectedSubmission.data.error).toContain("repayment guarantee");

  await updateUserAllocation(employee.dbId, 5000, year);
  const acceptedSubmission = await page.evaluate(async (id) => {
    const token = await (window as Window & {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk?.session?.getToken();
    const response = await fetch(`/api/requests/${id}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, data: await response.json() };
  }, requestId);
  expect(acceptedSubmission.status).toBe(200);
  expect((acceptedSubmission.data as { status: string }).status).toBe("pending_manager");
});