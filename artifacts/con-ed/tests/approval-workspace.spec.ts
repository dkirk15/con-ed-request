import { expect, test } from "./fixtures";
import { createClinic, getRequest, insertRequest } from "./helpers/db";

test.describe("Approval workspace", () => {
  test("manager approves one request, opens the next, and records a denial reason", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-workspace-manager`);
    const manager = await provisionUser({ role: "manager", clinicId });
    const firstEmployee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });
    const secondEmployee = await provisionUser({
      role: "employee",
      clinicId,
      managerId: manager.dbId,
    });
    const firstRequestId = await insertRequest({
      employeeId: firstEmployee.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: "E2E Workspace First Course",
      tuition: 325,
      totalRequested: 325,
      createdAt: new Date(Date.now() - 120_000),
    });
    const secondRequestId = await insertRequest({
      employeeId: secondEmployee.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: "E2E Workspace Second Course",
      tuition: 475,
      totalRequested: 475,
      createdAt: new Date(Date.now() - 60_000),
    });

    await signInAs(manager);
    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "Manager Approvals" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Workspace First Course" })).toBeVisible();
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Approve and open next" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();

    await expect(page.getByRole("heading", { name: "E2E Workspace Second Course" })).toBeVisible();
    expect((await getRequest(firstRequestId))?.status).toBe("pending_bo");

    await page.getByRole("button", { name: "Deny" }).click();
    await page.getByLabel("Reason for denial").fill("Course is not aligned with the current clinic plan.");
    await page.getByRole("button", { name: "Confirm denial" }).click();

    await expect(page.getByText("Queue is clear", { exact: true })).toBeVisible();
    const denied = await getRequest(secondRequestId);
    expect(denied?.status).toBe("manager_denied");
    expect(denied?.manager_denial_reason).toBe("Course is not aligned with the current clinic plan.");
  });

  test("manager workspace clearly identifies and allows self-approval", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-workspace-self`);
    const manager = await provisionUser({ role: "manager", clinicId });
    const requestId = await insertRequest({
      employeeId: manager.dbId,
      managerId: manager.dbId,
      status: "pending_manager",
      courseNames: "E2E Workspace Self Approval",
      tuition: 250,
      totalRequested: 250,
    });

    await signInAs(manager);
    await page.goto(`/approvals?selected=${requestId}`);

    await expect(page.getByText("Manager self-approval")).toBeVisible();
    await expect(page.getByText(/Current OSS policy allows managers to approve their own CE requests/)).toBeVisible();

    await page.getByRole("button", { name: "Approve and open next" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();

    await expect(page.getByText("Queue is clear", { exact: true })).toBeVisible();
    expect((await getRequest(requestId))?.status).toBe("pending_bo");
  });

  test("Business Office compares, adjusts, and approves funding in place", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-workspace-bo`);
    const businessOffice = await provisionUser({ role: "business_office" });
    const employee = await provisionUser({ role: "employee", clinicId });
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      status: "pending_bo",
      courseNames: "E2E Workspace Funding Comparison",
      tuition: 600,
      lodging: 150,
      otherCosts: 75,
      totalRequested: 825,
    });

    await signInAs(businessOffice);
    await page.goto(`/approvals?selected=${requestId}&clinicId=${clinicId}`);

    await expect(page.getByRole("heading", { name: "CE Approvals" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Workspace Funding Comparison" })).toBeVisible();

    await page.getByLabel("Approved Tuition / registration").fill("500");
    await page.getByLabel("Approved Other costs").fill("50");
    await expect(page.getByText(/2 funding amounts differ/)).toBeVisible();
    await expect(page.getByText("$700.00").last()).toBeVisible();

    await page.getByRole("button", { name: "Approve and open next" }).click();
    await expect(page.getByText(/\$700\.00 will be approved/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm approval" }).click();

    await expect(page.getByText("Queue is clear", { exact: true })).toBeVisible();
    const approved = await getRequest(requestId);
    expect(approved?.status).toBe("awaiting_receipt");
    expect(Number(approved?.approved_tuition)).toBe(500);
    expect(Number(approved?.approved_lodging)).toBe(150);
    expect(Number(approved?.approved_other)).toBe(50);
    expect(Number(approved?.total_approved)).toBe(700);
  });
});
