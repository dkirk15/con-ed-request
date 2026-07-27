import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest } from "./helpers/db";

/**
 * Covers access-control and lifecycle properties of the "Re-open for revision"
 * button that returns a denied request to draft.
 */
test.describe("Re-open denied request — button visibility", () => {
  test("employee sees re-open button on manager_denied; manager does not", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-reopen-vis`);
    const manager = await provisionUser({ role: "manager", clinicId });
    const employee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    const requestId = await insertRequest({
      employeeId: employee.dbId,
      managerId: manager.dbId,
      status: "manager_denied",
      courseNames: "E2E Reopen Visibility Course",
      tuition: 400,
      totalRequested: 400,
    });

    // Owner can see the button
    await signInAs(employee);
    await page.goto(`/requests/${requestId}`);
    await expect(
      page.getByRole("button", { name: "Re-open for revision" }),
    ).toBeVisible();

    // Manager viewing the same denied request must NOT see the button
    await signInAs(manager);
    await page.goto(`/requests/${requestId}`);
    await expect(
      page.getByRole("button", { name: "Re-open for revision" }),
    ).not.toBeVisible();
  });

  test("employee sees re-open button on bo_denied request", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(
      `E2E-Clinic-${Date.now()}-bodeny-reopen`,
    );
    const manager = await provisionUser({ role: "manager", clinicId });
    const employee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    const requestId = await insertRequest({
      employeeId: employee.dbId,
      managerId: manager.dbId,
      status: "bo_denied",
      courseNames: "E2E BO Denied Reopen Course",
      tuition: 500,
      totalRequested: 500,
    });

    await signInAs(employee);
    await page.goto(`/requests/${requestId}`);
    await expect(
      page.getByRole("button", { name: "Re-open for revision" }),
    ).toBeVisible();
  });
});

test.describe("Re-open denied request — post-action state", () => {
  test("re-open button disappears and draft actions appear after re-opening", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(
      `E2E-Clinic-${Date.now()}-reopen-flow`,
    );
    const manager = await provisionUser({ role: "manager", clinicId });
    const employee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    const requestId = await insertRequest({
      employeeId: employee.dbId,
      managerId: manager.dbId,
      status: "manager_denied",
      courseNames: "E2E Reopen Flow Course",
      tuition: 300,
      totalRequested: 300,
    });

    await signInAs(employee);
    await page.goto(`/requests/${requestId}`);
    await expect(
      page.getByRole("button", { name: "Re-open for revision" }),
    ).toBeVisible();

    // Click through the confirm dialog
    await page.getByRole("button", { name: "Re-open for revision" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByRole("heading", { name: "Re-open this request?" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Re-open for revision" }).click();

    // Success navigates to the edit page
    await expect(page).toHaveURL(new RegExp(`/requests/${requestId}/edit`));

    // Navigate back to the detail page
    await page.goto(`/requests/${requestId}`);

    // Status is now Draft
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();

    // Draft action (Continue editing link) is visible
    await expect(
      page.getByRole("link", { name: "Continue editing" }),
    ).toBeVisible();

    // Re-open button is gone (request is no longer denied)
    await expect(
      page.getByRole("button", { name: "Re-open for revision" }),
    ).not.toBeVisible();

    // DB confirms the transition
    const row = await getRequest(requestId);
    expect(row?.status).toBe("draft");
    expect(row?.["reopened_at"]).toBeTruthy();
    expect(row?.["reopener_id"]).toBe(employee.dbId);
  });
});

test.describe("Re-open denied request — API access control", () => {
  test("reopen API returns 404 when called for a request owned by a different employee", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(
      `E2E-Clinic-${Date.now()}-reopen-auth`,
    );
    const manager = await provisionUser({ role: "manager", clinicId });
    const owner = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });
    const other = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    const requestId = await insertRequest({
      employeeId: owner.dbId,
      managerId: manager.dbId,
      status: "manager_denied",
      courseNames: "E2E Reopen Auth Course",
      tuition: 200,
      totalRequested: 200,
    });

    // Sign in as the other employee (does not own the request)
    await signInAs(other);
    await page.goto(`/requests/${requestId}`);
    // Wait for Clerk session to initialise after navigation
    await page.waitForFunction(() => Boolean((window as any).Clerk?.session));

    const status = await page.evaluate(async (reqId: number) => {
      const token = await (window as any).Clerk.session.getToken();
      const res = await fetch(`/api/requests/${reqId}/reopen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    }, requestId);

    expect(status).toBe(404);
  });

  test("reopen API returns 400 when the request is in a non-denied status", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(
      `E2E-Clinic-${Date.now()}-reopen-status`,
    );
    const manager = await provisionUser({ role: "manager", clinicId });
    const employee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    const requestId = await insertRequest({
      employeeId: employee.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: "E2E Reopen Non-Denied Course",
      tuition: 300,
      totalRequested: 300,
    });

    await signInAs(employee);
    await page.goto(`/requests/${requestId}`);
    await page.waitForFunction(() => Boolean((window as any).Clerk?.session));

    const status = await page.evaluate(async (reqId: number) => {
      const token = await (window as any).Clerk.session.getToken();
      const res = await fetch(`/api/requests/${reqId}/reopen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    }, requestId);

    expect(status).toBe(400);
  });
});
