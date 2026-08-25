/**
 * Regression guard for the optimistic-removal race:
 * after a manager or BO acts on a queued request, the processed item must
 * disappear from the sidebar list immediately and never re-flash.
 *
 * openNextAfter() removes the completed item from the React-Query cache
 * synchronously (before the background invalidation re-fetch) so the sidebar
 * list must not contain the acted-on course name the moment the detail panel
 * transitions away.
 */
import { expect, test } from "./fixtures";
import { createClinic, insertRequest } from "./helpers/db";

test.describe("Approval queue — no flash after action", () => {
  // ── Manager: approve ──────────────────────────────────────────────────────
  test("manager: processed request is absent from sidebar immediately after approval", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const ts = Date.now();
    const clinicId = await createClinic(`E2E-Clinic-noflash-mgr-approve-${ts}`);
    const manager = await provisionUser({ role: "manager", clinicId });
    const emp1 = await provisionUser({ role: "employee", clinicId, managerId: manager.dbId });
    const emp2 = await provisionUser({ role: "employee", clinicId, managerId: manager.dbId });
    const firstName = `NF-Mgr-Approve-First-${ts}`;
    const secondName = `NF-Mgr-Approve-Second-${ts}`;

    const firstRequestId = await insertRequest({
      employeeId: emp1.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: firstName,
      tuition: 200,
      totalRequested: 200,
      createdAt: new Date(Date.now() - 120_000),
    });
    await insertRequest({
      employeeId: emp2.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: secondName,
      tuition: 300,
      totalRequested: 300,
      createdAt: new Date(Date.now() - 60_000),
    });

    await signInAs(manager);
    await page.goto(`/approvals?selected=${firstRequestId}`);

    const sidebar = page.getByRole("list", { name: "Requests awaiting approval" });
    const waitingCount = page.getByText("Waiting", { exact: true }).locator("..").locator("div").nth(1);
    await expect(sidebar.getByText(firstName)).toBeVisible();
    await expect(waitingCount).toHaveText("2");

    await page.route("**/api/requests?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });
    await page.getByRole("button", { name: "Approve and open next" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();

    // The processed entry must not appear in the sidebar at any point after the
    // action — the optimistic removal should fire before the re-fetch arrives.
    await expect(sidebar.getByText(firstName)).not.toBeVisible();
    await expect.poll(() => waitingCount.textContent(), { timeout: 500 }).toBe("1");

    // The next request should now be selected in the detail pane.
    await expect(page.getByRole("heading", { name: secondName })).toBeVisible();
  });

  // ── Manager: deny ─────────────────────────────────────────────────────────
  test("manager: processed request is absent from sidebar immediately after denial", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const ts = Date.now();
    const clinicId = await createClinic(`E2E-Clinic-noflash-mgr-deny-${ts}`);
    const manager = await provisionUser({ role: "manager", clinicId });
    const emp1 = await provisionUser({ role: "employee", clinicId, managerId: manager.dbId });
    const emp2 = await provisionUser({ role: "employee", clinicId, managerId: manager.dbId });
    const firstName = `NF-Mgr-Deny-First-${ts}`;
    const secondName = `NF-Mgr-Deny-Second-${ts}`;

    const firstRequestId = await insertRequest({
      employeeId: emp1.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: firstName,
      tuition: 200,
      totalRequested: 200,
      createdAt: new Date(Date.now() - 120_000),
    });
    await insertRequest({
      employeeId: emp2.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: secondName,
      tuition: 300,
      totalRequested: 300,
      createdAt: new Date(Date.now() - 60_000),
    });

    await signInAs(manager);
    await page.goto(`/approvals?selected=${firstRequestId}`);

    const sidebar = page.getByRole("list", { name: "Requests awaiting approval" });
    await expect(sidebar.getByText(firstName)).toBeVisible();

    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await page.getByLabel("Reason for denial").fill("Not aligned with clinic objectives.");
    await page.getByRole("button", { name: "Confirm denial" }).click();

    // Denied request must not re-appear in the sidebar.
    await expect(sidebar.getByText(firstName)).not.toBeVisible();

    // Next request should now be shown in the detail pane.
    await expect(page.getByRole("heading", { name: secondName })).toBeVisible();
  });

  // ── Business Office: approve ───────────────────────────────────────────────
  test("BO: processed request is absent from sidebar immediately after approval", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const ts = Date.now();
    const clinicId = await createClinic(`E2E-Clinic-noflash-bo-approve-${ts}`);
    const bo = await provisionUser({ role: "business_office" });
    const emp1 = await provisionUser({ role: "employee", clinicId });
    const emp2 = await provisionUser({ role: "employee", clinicId });
    const firstName = `NF-BO-Approve-First-${ts}`;
    const secondName = `NF-BO-Approve-Second-${ts}`;

    const firstRequestId = await insertRequest({
      employeeId: emp1.dbId,
      status: "pending_bo",
      courseNames: firstName,
      tuition: 400,
      totalRequested: 400,
      createdAt: new Date(Date.now() - 120_000),
    });
    await insertRequest({
      employeeId: emp2.dbId,
      status: "pending_bo",
      courseNames: secondName,
      tuition: 500,
      totalRequested: 500,
      createdAt: new Date(Date.now() - 60_000),
    });

    await signInAs(bo);
    await page.goto(`/approvals?selected=${firstRequestId}&clinicId=${clinicId}`);

    const sidebar = page.getByRole("list", { name: "Requests awaiting approval" });
    const waitingCount = page.getByText("Waiting", { exact: true }).locator("..").locator("div").nth(1);
    await expect(sidebar.getByText(firstName)).toBeVisible();
    await expect(waitingCount).toHaveText("2");

    await page.route("**/api/requests?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });
    await page.getByRole("button", { name: "Approve and open next" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();

    // Optimistic removal must have fired — the completed item must be gone.
    await expect(sidebar.getByText(firstName)).not.toBeVisible();
    await expect.poll(() => waitingCount.textContent(), { timeout: 500 }).toBe("1");

    // The next request must now be visible in the detail pane.
    await expect(page.getByRole("heading", { name: secondName })).toBeVisible();
  });

  // ── Business Office: deny ─────────────────────────────────────────────────
  test("BO: processed request is absent from sidebar immediately after denial", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const ts = Date.now();
    const clinicId = await createClinic(`E2E-Clinic-noflash-bo-deny-${ts}`);
    const bo = await provisionUser({ role: "business_office" });
    const emp1 = await provisionUser({ role: "employee", clinicId });
    const emp2 = await provisionUser({ role: "employee", clinicId });
    const firstName = `NF-BO-Deny-First-${ts}`;
    const secondName = `NF-BO-Deny-Second-${ts}`;

    const firstRequestId = await insertRequest({
      employeeId: emp1.dbId,
      status: "pending_bo",
      courseNames: firstName,
      tuition: 400,
      totalRequested: 400,
      createdAt: new Date(Date.now() - 120_000),
    });
    await insertRequest({
      employeeId: emp2.dbId,
      status: "pending_bo",
      courseNames: secondName,
      tuition: 500,
      totalRequested: 500,
      createdAt: new Date(Date.now() - 60_000),
    });

    await signInAs(bo);
    await page.goto(`/approvals?selected=${firstRequestId}&clinicId=${clinicId}`);

    const sidebar = page.getByRole("list", { name: "Requests awaiting approval" });
    await expect(sidebar.getByText(firstName)).toBeVisible();

    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await page.getByLabel("Reason for denial").fill("Funding not available for this course type.");
    await page.getByRole("button", { name: "Confirm denial" }).click();

    // Denied request must not re-appear in the sidebar.
    await expect(sidebar.getByText(firstName)).not.toBeVisible();

    // The next request must now be visible in the detail pane.
    await expect(page.getByRole("heading", { name: secondName })).toBeVisible();
  });
});
