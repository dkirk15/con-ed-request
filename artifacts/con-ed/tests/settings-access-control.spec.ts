import { test, expect } from "./fixtures";
import { createClinic } from "./helpers/db";

/**
 * Confirms that GET /api/settings and PATCH /api/settings are inaccessible
 * to non-admin roles (employee, manager, business_office, accounting), and that the Settings nav link is
 * absent from their sidebar navigation.
 *
 * The server enforces this via requireRole("admin") on both endpoints.
 * The frontend enforces it via NAV_ITEMS, which only includes Settings for admin.
 */

/** Call an authenticated JSON API endpoint from within the page context. */
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

test.describe("Settings access control — non-admin roles blocked", () => {
  // Fresh browser context per test to avoid stacked Clerk FAPI interceptors.
  test.use({
    context: async ({ browser }, use) => {
      const ctx = await browser.newContext();
      await use(ctx);
      await ctx.close();
    },
  });

  test("employee: GET /api/settings returns 403, PATCH /api/settings returns 403, no Settings nav link", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-settings-emp`);
    const employee = await provisionUser({ role: "employee", clinicId });
    await signInAs(employee);

    await page.goto("/dashboard");

    // Wait until the Clerk session is fully available in the browser context.
    await page.waitForFunction(() =>
      Boolean(
        (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
      ),
    );

    // API: GET /api/settings must return 403.
    const getRes = await apiCall(page, "GET", "/api/settings");
    expect(getRes.status).toBe(403);

    // API: PATCH /api/settings must return 403.
    const patchRes = await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: 9999,
    });
    expect(patchRes.status).toBe(403);

    // Frontend: Settings link must not appear in the sidebar.
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });

  test("manager: GET /api/settings returns 403, PATCH /api/settings returns 403, no Settings nav link", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-settings-mgr`);
    const manager = await provisionUser({ role: "manager", clinicId });
    await signInAs(manager);

    await page.goto("/dashboard");

    // Wait until the Clerk session is fully available in the browser context.
    await page.waitForFunction(() =>
      Boolean(
        (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
      ),
    );

    // API: GET /api/settings must return 403.
    const getRes = await apiCall(page, "GET", "/api/settings");
    expect(getRes.status).toBe(403);

    // API: PATCH /api/settings must return 403.
    const patchRes = await apiCall(page, "PATCH", "/api/settings", {
      annualBudget: 9999,
    });
    expect(patchRes.status).toBe(403);

    // Frontend: Settings link must not appear in the sidebar.
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });

  test("employee: direct /settings navigation shows access denied without the settings form", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-settings-direct`);
    const employee = await provisionUser({ role: "employee", clinicId });
    await signInAs(employee);

    await page.goto("/dashboard");
    await page.waitForFunction(() =>
      Boolean(
        (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
      ),
    );

    const settingsGetRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "GET" && url.pathname.endsWith("/api/settings")) {
        settingsGetRequests.push(request.url());
      }
    });

    // Typing the restricted URL directly must not expose the Settings form.
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByText("You do not have permission to view this page.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    expect(settingsGetRequests).toEqual([]);
  });

  test("employee: direct /settings navigation never flashes the settings form while permissions load", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const employee = await provisionUser({ role: "employee" });
    await signInAs(employee);

    let releaseMe!: () => void;
    const meReady = new Promise<void>((resolve) => {
      releaseMe = resolve;
    });
    let holdMe = true;
    await page.route("**/api/users/me", async (route) => {
      if (holdMe) await meReady;
      await route.continue();
    });

    try {
      const navigation = page.goto("/settings");

      // While the current user's role is unresolved, neither admin control may
      // be present, even if the settings request would resolve first.
      await expect(page.getByRole("spinbutton")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);

      holdMe = false;
      releaseMe();
      await navigation;
      await expect(
        page.getByText("You do not have permission to view this page.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("spinbutton")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    } finally {
      holdMe = false;
      releaseMe();
      await page.unroute("**/api/users/me");
    }
  });

  for (const { role, label } of [
    { role: "manager" as const, label: "manager" },
    { role: "business_office" as const, label: "business_office" },
    { role: "accounting" as const, label: "accounting" },
  ]) {
    test(`${label}: direct /settings navigation shows access denied without the settings form`, async ({
      page,
      provisionUser,
      signInAs,
    }) => {
      const clinicId = role === "manager"
        ? await createClinic(`E2E-Clinic-settings-direct-manager`)
        : undefined;
      const user = await provisionUser({ role, clinicId });
      await signInAs(user);

      await page.goto("/dashboard");
      await page.waitForFunction(() =>
        Boolean(
          (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
        ),
      );

      const settingsGetRequests: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (request.method() === "GET" && url.pathname.endsWith("/api/settings")) {
          settingsGetRequests.push(request.url());
        }
      });

      await page.goto("/settings");
      await expect(page).toHaveURL(/\/settings$/);
      await expect(
        page.getByText("You do not have permission to view this page.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("spinbutton")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
      expect(settingsGetRequests).toEqual([]);
    });
  }

  for (const { role, label } of [
    { role: "business_office" as const, label: "business_office" },
    { role: "accounting" as const, label: "accounting" },
  ]) {
    test(`${label}: GET /api/settings returns 403, PATCH /api/settings returns 403, no Settings nav link`, async ({
      page,
      provisionUser,
      signInAs,
    }) => {
      const user = await provisionUser({ role });
      await signInAs(user);

      await page.goto("/dashboard");

      // Wait until the Clerk session is fully available in the browser context.
      await page.waitForFunction(() =>
        Boolean(
          (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
        ),
      );

      const getRes = await apiCall(page, "GET", "/api/settings");
      expect(getRes.status).toBe(403);

      const patchRes = await apiCall(page, "PATCH", "/api/settings", {
        annualBudget: 9999,
      });
      expect(patchRes.status).toBe(403);

      await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    });
  }
});
