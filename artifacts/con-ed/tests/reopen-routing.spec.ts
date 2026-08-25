import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest, query } from "./helpers/db";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & { Clerk?: { session?: { getToken: () => Promise<string> } } };

async function requestApi(
  page: import("@playwright/test").Page,
  path: string,
  method = "POST",
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  await page.waitForFunction(() => Boolean((window as AnyWindow).Clerk?.session));
  return page.evaluate(
    async ({ path, method, body }) => {
      const token = await (window as AnyWindow).Clerk!.session!.getToken();
      const response = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    },
    { path, method, body },
  );
}

/**
 * When a request that was previously BO-denied is re-opened and resubmitted,
 * it must skip manager re-review and land directly in `pending_bo` because
 * `managerApprovedAt` is already set.
 *
 * When a request that was manager-denied is re-opened and resubmitted,
 * it must go through manager review again (`pending_manager`) because
 * `managerApprovedAt` is null.
 */
test.describe("Re-open routing on resubmit", () => {
  test("BO-denied → re-open → submit skips manager and lands in pending_bo", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic("E2E-Clinic-reopen-bo");
    const manager = await provisionUser({ role: "manager", clinicId });
    const businessOffice = await provisionUser({ role: "business_office" });
    const employee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    // Insert a bo_denied request that already has managerApprovedAt set.
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      managerId: manager.dbId,
      status: "bo_denied",
      courseNames: "E2E Reopen BO Denied Course",
      courseProvider: "E2E Reopen Provider",
      courseStartDate: "2026-10-01",
      courseEndDate: "2026-10-02",
      deliveryMethod: "virtual",
      tuition: 400,
      totalRequested: 400,
    });

    // Simulate the request having been manager-approved previously.
    await query(
      "UPDATE con_ed_requests SET manager_approved_at = NOW(), bo_denied_at = NOW(), bo_denial_reason = $1 WHERE id = $2",
      ["Outside policy", requestId],
    );

    // Step 1: Employee re-opens the denied request via the UI.
    await signInAs(employee);
    await page.goto(`/requests/${requestId}`);

    await page.getByRole("button", { name: "Re-open for revision" }).click();
    // Confirm in the alert dialog
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Re-open for revision" })
      .click();

    // onSuccess navigates to the edit form automatically.
    await expect(page).toHaveURL(new RegExp(`/requests/${requestId}/edit`));
    expect((await getRequest(requestId))?.status).toBe("draft");

    // The employee's reopened detail view must retain the original BO denial
    // reason and show that the request was reopened, not replace its history.
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("Business Office denied", { exact: true })).toBeVisible();
    await expect(page.getByText("Outside policy", { exact: true })).toBeVisible();
    await expect(page.getByText("Re-opened for revision", { exact: true })).toBeVisible();

    await page.goto(`/requests/${requestId}/edit`);

    // Step 2: Submit from the edit form (already navigated there by re-open).
    // Wait for the form to hydrate
    await expect(page.locator('input[name="courseProvider"]')).toHaveValue(
      "E2E Reopen Provider",
    );
    // Re-select delivery method to avoid Radix ↔ react-hook-form sync race
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Virtual", exact: true }).click();
    await page.getByRole("button", { name: "Submit for approval" }).click();

    // Step 3: Verify that the request landed in pending_bo (not pending_manager).
    await expect(
      page.getByText("Pending Business Office Approval").first(),
    ).toBeVisible();

    const row = await getRequest(requestId);
    expect(row?.status).toBe("pending_bo");
    // manager_approved_at must still be set — manager approval was NOT reset.
    expect(row?.manager_approved_at).not.toBeNull();

    // The next reviewer must also see the prior denial reason in the timeline.
    await signInAs(businessOffice);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("Business Office denied", { exact: true })).toBeVisible();
    await expect(page.getByText("Outside policy", { exact: true })).toBeVisible();
  });

  test("manager-denied → re-open → submit goes back to pending_manager", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic("E2E-Clinic-reopen-mgr");
    const manager = await provisionUser({ role: "manager", clinicId });
    const employee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    // Insert a manager_denied request — no managerApprovedAt because manager denied it.
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      managerId: manager.dbId,
      status: "manager_denied",
      courseNames: "E2E Reopen Manager Denied Course",
      courseProvider: "E2E Mgr Denied Provider",
      courseStartDate: "2026-11-10",
      courseEndDate: "2026-11-11",
      deliveryMethod: "virtual",
      tuition: 300,
      totalRequested: 300,
    });

    // Record the denial timestamp to make the state realistic.
    await query(
      "UPDATE con_ed_requests SET manager_denied_at = NOW(), manager_denial_reason = $1 WHERE id = $2",
      ["Not applicable", requestId],
    );

    // Step 1: Employee re-opens the denied request via the UI.
    await signInAs(employee);
    await page.goto(`/requests/${requestId}`);

    await page.getByRole("button", { name: "Re-open for revision" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Re-open for revision" })
      .click();

    // onSuccess navigates to the edit form automatically.
    await expect(page).toHaveURL(new RegExp(`/requests/${requestId}/edit`));
    expect((await getRequest(requestId))?.status).toBe("draft");

    // The employee's reopened detail view must retain the original manager
    // denial reason and show that the request was reopened.
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("Manager denied", { exact: true })).toBeVisible();
    await expect(page.getByText("Not applicable", { exact: true })).toBeVisible();
    await expect(page.getByText("Re-opened for revision", { exact: true })).toBeVisible();

    await page.goto(`/requests/${requestId}/edit`);

    // Step 2: Submit from the edit form (already navigated there by re-open).
    await expect(page.locator('input[name="courseProvider"]')).toHaveValue(
      "E2E Mgr Denied Provider",
    );
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Virtual", exact: true }).click();
    await page.getByRole("button", { name: "Submit for approval" }).click();

    // Step 3: Verify the request went to pending_manager (requires fresh manager review).
    await expect(page.getByText("Pending Manager Approval").first()).toBeVisible();

    const row = await getRequest(requestId);
    expect(row?.status).toBe("pending_manager");
    // manager_approved_at must remain null — manager has not yet approved.
    expect(row?.manager_approved_at).toBeNull();

    // The next reviewer must also see the prior denial reason in the timeline.
    await signInAs(manager);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("Manager denied", { exact: true })).toBeVisible();
    await expect(page.getByText("Not applicable", { exact: true })).toBeVisible();
  });

  test("two manager denial and reopen cycles preserve every timeline event", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-reopen-history-${Date.now()}`);
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
      courseNames: "E2E Reopen History Course",
      courseProvider: "E2E Reopen History Provider",
      courseStartDate: "2026-10-01",
      courseEndDate: "2026-10-02",
      deliveryMethod: "virtual",
      tuition: 200,
      totalRequested: 200,
    });

    await signInAs(manager);
    const firstDenial = await requestApi(page, `/api/requests/${requestId}/manager-deny`, "POST", {
      reason: "First manager explanation",
    });
    expect(firstDenial.status).toBe(200);

    await signInAs(employee);
    const firstReopen = await requestApi(page, `/api/requests/${requestId}/reopen`);
    expect(firstReopen.status).toBe(200);
    const firstResubmission = await requestApi(page, `/api/requests/${requestId}/submit`);
    expect(firstResubmission.status).toBe(200);
    expect((await getRequest(requestId))?.status).toBe("pending_manager");

    await signInAs(manager);
    const secondDenial = await requestApi(page, `/api/requests/${requestId}/manager-deny`, "POST", {
      reason: "Second manager explanation",
    });
    expect(secondDenial.status).toBe(200);

    await signInAs(employee);
    const secondReopen = await requestApi(page, `/api/requests/${requestId}/reopen`);
    expect(secondReopen.status).toBe(200);
    const secondResubmission = await requestApi(page, `/api/requests/${requestId}/submit`);
    expect(secondResubmission.status).toBe(200);
    expect((await getRequest(requestId))?.status).toBe("pending_manager");

    const history = await query<{ type: string; reason: string | null }>(
      `SELECT type, reason
         FROM con_ed_request_events
        WHERE request_id = $1
        ORDER BY created_at, id`,
      [requestId],
    );
    expect(history).toEqual([
      { type: "manager_denied", reason: "First manager explanation" },
      { type: "reopened", reason: null },
      { type: "manager_denied", reason: "Second manager explanation" },
      { type: "reopened", reason: null },
    ]);

    await signInAs(manager);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("First manager explanation", { exact: true })).toBeVisible();
    await expect(page.getByText("Second manager explanation", { exact: true })).toBeVisible();
    const eventTitles = await page.locator("ol li h3").allTextContents();
    expect(
      eventTitles.filter((title) =>
        ["Manager denied", "Re-opened for revision"].includes(title),
      ),
    ).toEqual([
      "Manager denied",
      "Re-opened for revision",
      "Manager denied",
      "Re-opened for revision",
    ]);
  });
});

/**
 * Reopen guard: POST /api/requests/:id/reopen must return HTTP 400 with a clear
 * error message when the request status is anything other than manager_denied or
 * bo_denied. This covers every non-denied status in the lifecycle.
 */
test.describe("Reopen guard — non-denied statuses return 400", () => {
  const nonDeniedStatuses = [
    "draft",
    "pending_manager",
    "pending_bo",
    "awaiting_receipt",
    "cancelled",
    "receipt_submitted",
    "reimbursed",
  ] as const;

  for (const status of nonDeniedStatuses) {
    test(`reopen returns 400 for status=${status}`, async ({
      page,
      provisionUser,
      signInAs,
    }) => {
      const clinicId = await createClinic(`E2E-Clinic-reopen-guard-${status}`);
      const manager = await provisionUser({ role: "manager", clinicId });
      const employee = await provisionUser({
        role: "employee",
        clinicId,
        managerId: manager.dbId,
      });

      const requestId = await insertRequest({
        employeeId: employee.dbId,
        managerId: manager.dbId,
        status,
        courseNames: `E2E Reopen Guard ${status}`,
        tuition: 200,
        totalRequested: 200,
      });

      // Sign in as the owning employee and call the reopen endpoint directly.
      await signInAs(employee);
      await page.goto("/");
      await page.waitForFunction(
        () => Boolean((window as AnyWindow).Clerk?.session),
      );

      const { httpStatus, body } = await page.evaluate(
        async (reqId: number) => {
          const token = await (window as AnyWindow).Clerk!.session!.getToken();
          const res = await fetch(`/api/requests/${reqId}/reopen`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          return { httpStatus: res.status, body: await res.json() };
        },
        requestId,
      );

      expect(httpStatus).toBe(400);
      expect(body).toMatchObject({
        error: "Only denied requests can be re-opened for revision",
      });

      // Status must remain unchanged in the database.
      const row = await getRequest(requestId);
      expect(row?.status).toBe(status);
    });
  }
});

/**
 * Cross-employee access control: POST /api/requests/:id/reopen must return 404
 * when the authenticated user does not own the request, and the request status
 * must not change.
 */
test.describe("Re-open cross-employee access control", () => {
  test("reopen is blocked with 404 when called by a different employee", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic("E2E-Clinic-reopen-xemp");
    const manager = await provisionUser({ role: "manager", clinicId });

    // owner: the employee who owns the denied request.
    const owner = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    // intruder: a different employee in the same clinic.
    const intruder = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });

    const requestId = await insertRequest({
      employeeId: owner.dbId,
      managerId: manager.dbId,
      status: "manager_denied",
      courseNames: "E2E Cross-Employee Reopen Guard",
      tuition: 250,
      totalRequested: 250,
    });

    await query(
      "UPDATE con_ed_requests SET manager_denied_at = NOW(), manager_denial_reason = $1 WHERE id = $2",
      ["Cross-employee test", requestId],
    );

    // Sign in as the intruder, then attempt the reopen API call directly.
    await signInAs(intruder);
    // Navigate to any page in the app so the Clerk session is fully initialised.
    await page.goto("/");
    await page.waitForFunction(
      () => Boolean((window as AnyWindow).Clerk?.session),
    );

    const httpStatus = await page.evaluate(async (reqId: number) => {
      const token = await (window as AnyWindow).Clerk!.session!.getToken();
      const res = await fetch(`/api/requests/${reqId}/reopen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    }, requestId);

    // The guard must return 404 — request not found for this user.
    expect(httpStatus).toBe(404);

    // The request status must remain unchanged in the database.
    const row = await getRequest(requestId);
    expect(row?.status).toBe("manager_denied");
  });
});
