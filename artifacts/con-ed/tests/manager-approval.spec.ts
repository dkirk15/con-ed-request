import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest } from "./helpers/db";

function requestIdFromUrl(url: string): number {
  const match = url.match(/\/requests\/(\d+)/);
  if (!match) throw new Error(`No request id in URL: ${url}`);
  return Number(match[1]);
}

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

    // Dashboard should show at least 1 request pending the manager's approval.
    await page.goto("/dashboard");
    const actionCard = page.locator("text=Action Required").locator("..");
    await expect(actionCard.locator("text=Requests pending your approval")).toBeVisible();
    const countText = await page
      .locator('[class*="text-3xl"][class*="font-bold"][class*="amber"]')
      .first()
      .textContent();
    expect(Number(countText?.trim())).toBeGreaterThanOrEqual(1);

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

  test("manager submits their own request -> routed to their manager", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-mgrself`);
    // A senior manager who will receive the self-submitting manager's request.
    const senior = await provisionUser({ role: "manager", clinicId });
    const manager = await provisionUser({
      role: "manager",
      clinicId,
      managerId: senior.dbId,
    });

    await signInAs(manager);
    await page.goto("/requests/new");

    await page.getByLabel("Course Name(s)").fill("E2E Manager Self Course");
    await page.locator('input[step="0.01"]').first().fill("300");
    await page.getByRole("button", { name: "Submit Request" }).click();

    await expect(page).toHaveURL(/\/requests\/\d+/);
    await expect(page.getByText("Pending Manager Approval")).toBeVisible();

    const id = requestIdFromUrl(page.url());
    const row = await getRequest(id);
    expect(row?.status).toBe("pending_manager");
    expect(row?.employee_id).toBe(manager.dbId);
    expect(row?.manager_id).toBe(senior.dbId);
  });
});
