import { test, expect } from "./fixtures";
import { createClinic } from "./helpers/db";

const year = new Date().getFullYear();

async function apiRequest(
  page: import("@playwright/test").Page,
  path: string,
  method: "GET" | "PATCH",
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  await page.waitForFunction(() => Boolean(
    (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
  ));
  return page.evaluate(async ({ path, method, body }) => {
    const token = await (window as Window & {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk?.session?.getToken();
    const response = await fetch(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }, { path, method, body });
}

test("invalid hire dates are rejected without changing the balance or report allocation", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Hire-Date-${Date.now()}`);
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    hireDate: `${year}-07-01`,
  });
  const admin = await provisionUser({ role: "admin", clinicId });

  await signInAs(admin);
  for (const hireDate of ["not-a-date", "2025-02-29"]) {
    const response = await apiRequest(
      page,
      `/api/users/${employee.dbId}`,
      "PATCH",
      { hireDate },
    );
    expect(response.status).toBe(400);
    expect(response.data.error).toBe("Hire date must be a real YYYY-MM-DD calendar date");
  }

  await signInAs(employee);
  const balance = await apiRequest(page, `/api/users/${employee.dbId}/balance`, "GET");
  expect(balance.status).toBe(200);
  expect(balance.data).toMatchObject({
    annualAllocation: 1000,
    isProrated: true,
    hireMonth: 7,
  });

  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);
  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  const row = budgetSection.getByRole("row").filter({ hasText: employee.name });
  await expect(row).toContainText("$1,000.00");
});