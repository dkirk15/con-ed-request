import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest } from "./helpers/db";

/**
 * A manager reviews requests from their own clinic. Approving moves the request
 * to `pending_bo`; denying (with a reason) moves it to `manager_denied`.
 */
test.describe("Manager review", () => {
  test("manager approves a pending request -> pending_bo", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-mgrapp`);
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
      courseNames: "E2E Pending Approval Course",
      tuition: 400,
      totalRequested: 400,
    });

    await signInAs(manager);
    await page.goto(`/requests/${requestId}`);

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Pending Business Office")).toBeVisible();

    const row = await getRequest(requestId);
    expect(row?.status).toBe("pending_bo");
    expect(row?.manager_id).toBe(manager.dbId);
  });

  test("manager denies a pending request with a reason -> manager_denied", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-mgrdeny`);
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
      courseNames: "E2E To Be Denied Course",
      tuition: 700,
      totalRequested: 700,
    });

    await signInAs(manager);
    await page.goto(`/requests/${requestId}`);

    await page.getByRole("button", { name: "Deny" }).click();
    await page
      .getByPlaceholder("Reason for denial...")
      .fill("Budget exhausted for this cycle.");
    await page.getByRole("button", { name: "Confirm Denial" }).click();

    await expect(
      page
        .getByRole("heading", { name: /Request #\d+/ })
        .getByText("Manager Denied"),
    ).toBeVisible();

    const row = await getRequest(requestId);
    expect(row?.status).toBe("manager_denied");
  });
});
