import { test, expect } from "./fixtures";
import { createClinic } from "./helpers/db";
import { signIn } from "./helpers/clerk";

/**
 * Verifies that updating annualBudget via PATCH /api/settings immediately
 * affects balance calculations (no stale-cache lag), including prorated
 * hire-year allocations that must scale proportionally.
 *
 * The PATCH endpoint calls invalidateSettingsCache(), so the very next balance
 * fetch hits the database and reflects the new value.
 *
 * Prorated formula (from balance.ts):
 *   allocation = round((annualBudget * (13 - hireMonth)) / 12)
 *
 * Test matrix:
 *   - Full-year employee  (hired a year before current year → full budget)
 *   - Prorated employee   (hired July 1 of current year → 6/12 of budget)
 */

const ORIGINAL_BUDGET = 2000;
const TEST_BUDGET = 1500;

/** Helper: call an authenticated JSON API endpoint from within the page context. */
async function apiCall(
  page: import("@playwright/test").Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  await page.waitForFunction(() =>
    Boolean(
      (window as Window & {
        Clerk?: { session?: { getToken?: unknown } };
      }).Clerk?.session?.getToken,
    ),
  );
  return page.evaluate(
    async ({ method, path, body }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (window as any).Clerk?.session?.getToken();
      const res = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { status: res.status, data };
    },
    { method, path, body },
  );
}

test("budget change in Settings immediately reflects in employee balance calculations", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const year = new Date().getFullYear();
  const clinicId = await createClinic(`E2E-Clinic-settings-budget`);

  // Full-year employee: hired before the current year → receives the full budget.
  const fullYearEmployee = await provisionUser({
    role: "employee",
    clinicId,
    hireDate: `${year - 1}-03-15`,
  });

  // Prorated employee: hired July 1 of the current year → 6 remaining months.
  // allocation = round((budget × (13 − 7)) / 12) = round(budget / 2)
  const proratedEmployee = await provisionUser({
    role: "employee",
    clinicId,
    hireDate: `${year}-07-01`,
  });

  // Admin is needed to PATCH /api/settings and read any user's balance.
  const admin = await provisionUser({ role: "admin", clinicId });
  await signInAs(admin);
  await page.goto("/dashboard");

  // Wait until a usable Clerk session is available in the browser context.
  await page.waitForFunction(() =>
    Boolean(
      (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
    ),
  );

  try {
    // ── 1. Verify baseline (default budget = $2,000) ───────────────────────
    const baselineFull = await apiCall(
      page,
      "GET",
      `/api/users/${fullYearEmployee.dbId}/balance`,
    );
    expect(baselineFull.status).toBe(200);
    expect((baselineFull.data as { annualAllocation: number }).annualAllocation).toBe(
      ORIGINAL_BUDGET,
    );

    // Prorated: (2000 × (13 − 7)) / 12 = 2000 × 0.5 = 1000
    const baselineProrated = await apiCall(
      page,
      "GET",
      `/api/users/${proratedEmployee.dbId}/balance`,
    );
    expect(baselineProrated.status).toBe(200);
    expect(
      (baselineProrated.data as { annualAllocation: number }).annualAllocation,
    ).toBe(1000);

    // ── 2. Update the budget to $1,500 ────────────────────────────────────
    const patchRes = await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: TEST_BUDGET,
    });
    expect(patchRes.status).toBe(200);
    expect((patchRes.data as { annualBudget: number }).annualBudget).toBe(
      TEST_BUDGET,
    );

    // ── 3. Full-year employee should immediately see $1,500 ───────────────
    const updatedFull = await apiCall(
      page,
      "GET",
      `/api/users/${fullYearEmployee.dbId}/balance`,
    );
    expect(updatedFull.status).toBe(200);
    expect(
      (updatedFull.data as { annualAllocation: number }).annualAllocation,
    ).toBe(TEST_BUDGET);

    // ── 4. Prorated employee should scale proportionally ──────────────────
    // (1500 × (13 − 7)) / 12 = 1500 × 0.5 = 750
    const expectedProrated = Math.round((TEST_BUDGET * (13 - 7)) / 12 * 100) / 100;
    const updatedProrated = await apiCall(
      page,
      "GET",
      `/api/users/${proratedEmployee.dbId}/balance`,
    );
    expect(updatedProrated.status).toBe(200);
    expect(
      (updatedProrated.data as { annualAllocation: number }).annualAllocation,
    ).toBe(expectedProrated);

    // ── 5. isProrated flag must still be true for the hire-year employee ──
    expect(
      (updatedProrated.data as { isProrated: boolean }).isProrated,
    ).toBe(true);
  } finally {
    // Always restore the original budget so other tests are not affected.
    await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: ORIGINAL_BUDGET,
    });
  }
});

test("only admins can change the annual budget", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic("E2E-Clinic-settings-access");
  const nonAdminUsers = [
    await provisionUser({ role: "employee", clinicId }),
    await provisionUser({ role: "manager", clinicId }),
    await provisionUser({ role: "business_office" }),
    await provisionUser({ role: "accounting" }),
  ];
  const admin = await provisionUser({ role: "admin", clinicId });

  // Keep the attempted value distinct from the normal budget so an accidental
  // successful non-admin update cannot be mistaken for a no-op.
  const unauthorizedBudget = 9999;
  for (const user of nonAdminUsers) {
    await signInAs(user);
    await page.goto("/dashboard");
    await page.waitForFunction(() => Boolean(
      (window as Window & {
        Clerk?: { session?: { getToken?: unknown } };
      }).Clerk?.session?.getToken,
    ));
    const response = await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: unauthorizedBudget,
    });
    expect(response.status).toBe(403);
  }

  await signInAs(admin);
  await page.goto("/dashboard");
  await page.waitForFunction(() => Boolean(
    (window as Window & {
      Clerk?: { session?: { getToken?: unknown } };
    }).Clerk?.session?.getToken,
  ));
  try {
    const adminResponse = await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: 2100,
    });
    expect(adminResponse.status).toBe(200);
    expect((adminResponse.data as { annualBudget: number }).annualBudget).toBe(2100);
  } finally {
    await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: ORIGINAL_BUDGET,
    });
  }
});

test("budget report refreshes after changing the budget in Settings", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const year = new Date().getFullYear();
  const clinicId = await createClinic("E2E-Clinic-settings-refresh");
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    firstName: "Budget",
    lastName: "Refresh Employee",
    hireDate: `${year - 1}-01-01`,
  });
  const admin = await provisionUser({ role: "admin", clinicId });
  await signInAs(admin);

  try {
    // Open the report and record the default allocation before changing Settings.
    await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);
    const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
    await expect(budgetSection).toBeVisible();
    const row = budgetSection.getByRole("row").filter({ hasText: employee.name });
    await expect(row.getByRole("cell").nth(2)).toHaveText("$2,000.00");

    // Navigate through the app shell rather than reloading the page.
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    const budgetInput = page.getByRole("spinbutton");
    await expect(budgetInput).toHaveValue("2000");
    await budgetInput.fill("1500");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();

    // Return through the Reports link, with no hard refresh, and select funding.
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/reports/);
    await page.getByRole("tab", { name: "Funding & advances" }).click();
    await expect(page.getByRole("region", { name: "Employee budget usage" })).toBeVisible();

    const refreshedRow = page
      .getByRole("region", { name: "Employee budget usage" })
      .getByRole("row")
      .filter({ hasText: employee.name });
    await expect(refreshedRow.getByRole("cell").nth(2)).toHaveText("$1,500.00");
  } finally {
    // Restore the shared setting even if a UI assertion fails.
    await page.waitForFunction(() => Boolean(
      (window as Window & {
        Clerk?: { session?: { getToken?: unknown } };
      }).Clerk?.session?.getToken,
    ));
    await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: ORIGINAL_BUDGET,
    });
  }
});

test("new request refreshes funding after an admin changes the budget", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-settings-new-request-${Date.now()}`);
  const employee = await provisionUser({ role: "employee", clinicId });
  const admin = await provisionUser({ role: "admin", clinicId });
  const browser = page.context().browser();
  if (!browser) throw new Error("Playwright browser is unavailable");
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  try {
    await signInAs(employee);
    await page.goto("/requests/new");
    await expect(page.getByText("$2,000.00", { exact: true })).toBeVisible();

    // Keep the employee session and form page alive while the admin changes
    // the shared setting in a separate browser context.
    await signIn(adminPage, admin.email);
    await adminPage.goto("/dashboard");
    const updateResponse = await apiCall(adminPage, "PATCH", "/api/settings", { annualBudget: 1500 });
    expect(updateResponse.status).toBe(200);

    // Navigate within the same employee session; do not reload the browser.
    await page.goto("/dashboard");
    await page.goto("/requests/new");
    await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible();

    // The refreshed threshold should also drive the guarantee requirement.
    await page.getByLabel("Tuition / registration ($)").fill("1600");
    await expect(page.getByText("$100.00 future CE debt", { exact: true })).toBeVisible();
    await expect(page.getByText("OSS repayment guarantee", { exact: true })).toBeVisible();
  } finally {
    await signIn(adminPage, admin.email);
    await adminPage.goto("/dashboard");
    const restoreResponse = await apiCall(adminPage, "PATCH", "/api/settings", { annualBudget: ORIGINAL_BUDGET });
    expect(restoreResponse.status).toBe(200);
    await adminContext.close();
  }
});
