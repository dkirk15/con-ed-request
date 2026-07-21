import { test, expect } from "./fixtures";
import { createClinic, insertRequest } from "./helpers/db";

test("employee request queue keeps status filters in the URL", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-queue-employee`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });

  await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "draft",
    courseNames: "E2E Queue Draft Course",
    tuition: 125,
    totalRequested: 125,
  });
  await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "reimbursed",
    courseNames: "E2E Queue Completed Course",
    tuition: 250,
    totalRequested: 250,
    approvedTuition: 250,
    totalApproved: 250,
  });

  await signInAs(employee);
  await page.goto("/requests?status=draft");

  await expect(page).toHaveURL(/status=draft/);
  await expect(page.getByRole("heading", { name: "My Requests" })).toBeVisible();
  await expect(page.getByText("E2E Queue Draft Course")).toBeVisible();
  await expect(page.getByText("E2E Queue Completed Course")).toHaveCount(0);

  await page.getByRole("link", { name: "Completed" }).click();
  await expect(page).toHaveURL(/status=reimbursed/);
  await expect(page.getByText("E2E Queue Completed Course")).toBeVisible();
  await expect(page.getByText("E2E Queue Draft Course")).toHaveCount(0);
});

test("manager can switch between approval work and personal drafts", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-queue-manager`);
  const seniorManager = await provisionUser({ role: "manager", clinicId });
  const manager = await provisionUser({
    role: "manager",
    clinicId,
    managerId: seniorManager.dbId,
  });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });

  await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "pending_manager",
    courseNames: "E2E Queue Approval Course",
    tuition: 400,
    totalRequested: 400,
  });
  await insertRequest({
    employeeId: manager.dbId,
    managerId: seniorManager.dbId,
    status: "draft",
    courseNames: "E2E Manager Personal Draft",
    tuition: 175,
    totalRequested: 175,
  });

  await signInAs(manager);
  await page.goto("/requests?status=pending_manager");

  await expect(page.getByRole("heading", { name: "Approval Queue" })).toBeVisible();
  await expect(page.getByText("E2E Queue Approval Course")).toBeVisible();
  await expect(page.getByText("E2E Manager Personal Draft")).toHaveCount(0);

  await page.getByRole("link", { name: "My Requests" }).first().click();
  await expect(page).toHaveURL(/scope=mine/);
  await expect(page.getByText("E2E Manager Personal Draft")).toBeVisible();
  await expect(page.getByText("E2E Queue Approval Course")).toHaveCount(0);
});
