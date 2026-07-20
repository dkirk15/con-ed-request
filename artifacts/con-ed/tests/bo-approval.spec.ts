import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest } from "./helpers/db";

/**
 * The Business Office gives final sign-off on manager-approved requests.
 * Final Approve sets the approved amounts and moves to `awaiting_receipt`;
 * denying moves to `bo_denied`.
 */
test.describe("Business Office review", () => {
  test("BO final-approves a request -> awaiting_receipt", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-boapp`);
    const bo = await provisionUser({ role: "business_office" });
    const employee = await provisionUser({ role: "employee", clinicId });
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      status: "pending_bo",
      courseNames: "E2E Awaiting BO Course",
      tuition: 600,
      totalRequested: 600,
    });

    await signInAs(bo);
    await page.goto(`/requests/${requestId}`);

    await page.getByRole("button", { name: "Final Approve" }).click();

    // The approval dialog exposes one number input per cost category, in order:
    // Tuition, Lodging, Airfare, Rental Car, Parking, Other. The BO can adjust
    // each before confirming; total_approved must equal their sum.
    const dialog = page.getByRole("dialog");
    const amounts = dialog.locator('input[type="number"]');
    await amounts.nth(0).fill("500"); // Tuition
    await amounts.nth(1).fill("100"); // Lodging
    await amounts.nth(5).fill("50"); // Other

    await page.getByRole("button", { name: "Confirm Approval" }).click();

    await expect(page.getByText("Awaiting Receipt")).toBeVisible();

    const row = await getRequest(requestId);
    expect(row?.status).toBe("awaiting_receipt");
    expect(Number(row?.approved_tuition)).toBe(500);
    expect(Number(row?.approved_lodging)).toBe(100);
    expect(Number(row?.approved_other)).toBe(50);
    expect(Number(row?.total_approved)).toBe(650);
    expect(row?.bo_approver_id).toBe(bo.dbId);
  });

  test("BO denies a request with a reason -> bo_denied", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-bodeny`);
    const bo = await provisionUser({ role: "business_office" });
    const employee = await provisionUser({ role: "employee", clinicId });
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      status: "pending_bo",
      courseNames: "E2E BO Deny Course",
      tuition: 900,
      totalRequested: 900,
    });

    await signInAs(bo);
    await page.goto(`/requests/${requestId}`);

    await page.getByRole("button", { name: "Deny" }).click();
    await page
      .getByPlaceholder("Reason for denial...")
      .fill("Outside policy for this category.");
    await page.getByRole("button", { name: "Confirm Denial" }).click();

    await expect(page.getByText("CE Denied").first()).toBeVisible();

    const row = await getRequest(requestId);
    expect(row?.status).toBe("bo_denied");
  });
});
