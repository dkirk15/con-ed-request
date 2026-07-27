import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest, query } from "./helpers/db";

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
  });
});
