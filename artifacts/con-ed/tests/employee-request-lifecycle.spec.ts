import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest } from "./helpers/db";
import type { RequestRow } from "./helpers/db";

function requestIdFromUrl(url: string): number {
  const match = url.match(/\/requests\/(\d+)/);
  if (!match) throw new Error(`No request id in URL: ${url}`);
  return Number(match[1]);
}

/**
 * An employee fills the New Request form within budget. The form creates the
 * draft and immediately submits it, so it lands in `pending_manager`.
 */
test("employee creates and submits an in-budget request", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-newreq`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });

  await signInAs(employee);
  await page.goto("/requests/new");

  await page
    .getByLabel("Course Name(s)")
    .fill("E2E Advanced Manual Therapy");
  // Cost inputs wrap the <input> in a div for the "$" prefix, so the label's
  // htmlFor lands on the wrapper, not the input — target by the cost-only step.
  await page.locator('input[step="0.01"]').first().fill("500");

  await page.getByRole("button", { name: "Submit Request" }).click();

  await expect(page).toHaveURL(/\/requests\/\d+/);
  await expect(page.getByText("Pending Manager Approval")).toBeVisible();

  const id = requestIdFromUrl(page.url());
  const row = await getRequest(id);
  expect(row?.status).toBe("pending_manager");
  expect(Number(row?.total_requested)).toBe(500);
  expect(row?.requires_repayment_guarantee).toBe(false);

  // The submitted request appears in the employee's Requests list as pending.
  await page.goto("/requests");
  const requestRow = page
    .getByRole("row")
    .filter({ hasText: "E2E Advanced Manual Therapy" });
  await expect(requestRow).toBeVisible();
  await expect(requestRow.getByText("Pending Manager Approval")).toBeVisible();
});

/**
 * Employee draft lifecycle: a draft created directly in the DB is visible on
 * the request detail page with a "Submit Request" action. Clicking Submit
 * moves it to pending_manager.
 */
test("employee submits a draft request from the detail page -> pending_manager", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-draft`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });

  // Insert a draft directly — mirrors the state after NewRequestPage creates
  // the record but before the submit call fires (e.g. if submit fails).
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "draft",
    courseNames: "E2E Draft Lifecycle Course",
    tuition: 350,
    totalRequested: 350,
  });

  await signInAs(employee);
  await page.goto(`/requests/${requestId}`);

  // Draft status badge is visible (use exact match to avoid substring hits
  // from the course name and clinic name which also contain "Draft").
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  // The "Submit Request" action is available to the owner.
  await expect(
    page.getByRole("button", { name: "Submit Request" }),
  ).toBeVisible();

  // Submit the draft.
  await page.getByRole("button", { name: "Submit Request" }).click();

  // Status transitions to pending_manager in the UI.
  await expect(page.getByText("Pending Manager Approval")).toBeVisible();

  // Confirm the DB row was updated.
  const row = await getRequest(requestId);
  expect(row?.status).toBe("pending_manager");
});

/**
 * Employee edits a draft via PATCH /api/requests/:id (called from the
 * authenticated browser session), then submits it via the UI.
 *
 * Draft editing is supported by the API but not yet surfaced in the UI —
 * the NewRequestPage creates and immediately submits in one step. This test
 * exercises the edit path through the real API endpoint so the route, auth
 * guard, and field updates are all covered.
 */
test("employee edits a draft via the API then submits via UI -> pending_manager", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-edit`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });

  // Seed an initial draft.
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "draft",
    courseNames: "E2E Draft Original Title",
    tuition: 200,
    totalRequested: 200,
  });

  await signInAs(employee);
  await page.goto(`/requests/${requestId}`);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  // Edit the draft via PATCH /api/requests/:id from the authenticated session.
  const patchStatus = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (window as any).Clerk?.session?.getToken();
      const res = await fetch(`/api/requests/${args.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          courseNames: args.courseNames,
          tuition: args.tuition,
          totalRequested: args.totalRequested,
        }),
      });
      return res.status;
    },
    { id: requestId, courseNames: "E2E Draft Edited Title", tuition: 300, totalRequested: 300 },
  );
  expect(patchStatus).toBe(200);

  // Verify the edit is reflected in the DB.
  const editedRow: RequestRow | undefined = await getRequest(requestId);
  expect(editedRow?.course_names).toBe("E2E Draft Edited Title");
  expect(Number(editedRow?.total_requested)).toBe(300);

  // Reload the page so the UI picks up the updated data, then submit via UI.
  await page.reload();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit Request" }).click();
  await expect(page.getByText("Pending Manager Approval")).toBeVisible();

  // DB confirms the final status.
  const finalRow = await getRequest(requestId);
  expect(finalRow?.status).toBe("pending_manager");
});
