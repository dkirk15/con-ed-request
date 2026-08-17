import { test, expect } from "./fixtures";
import { createClinic } from "./helpers/db";

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
