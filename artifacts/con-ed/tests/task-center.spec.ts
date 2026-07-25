import { test, expect } from "./fixtures";
import { createClinic, insertRequest } from "./helpers/db";

const DAY_MS = 86_400_000;
const dateOnly = (daysFromToday: number) =>
  new Date(Date.now() + daysFromToday * DAY_MS).toISOString().slice(0, 10);

test("employee task center separates next actions from requests in progress", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Task-Center-Employee-${Date.now()}`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });

  const draftCourse = `E2E Draft Next Step ${Date.now()}`;
  const receiptCourse = `E2E Receipt Next Step ${Date.now()}`;
  const reviewCourse = `E2E Review In Progress ${Date.now()}`;
  await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "draft",
    courseNames: draftCourse,
    totalRequested: 125,
    updatedAt: new Date(Date.now() - 15 * DAY_MS),
  });
  await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "awaiting_receipt",
    courseNames: receiptCourse,
    courseStartDate: dateOnly(-12),
    courseEndDate: dateOnly(-10),
    totalRequested: 300,
    totalApproved: 275,
  });
  await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "pending_manager",
    courseNames: reviewCourse,
    totalRequested: 200,
  });

  await signInAs(employee);
  await page.goto("/dashboard");

  const taskCenter = page.getByRole("region", { name: "Your next steps" });
  await expect(taskCenter).toBeVisible();
  await expect(taskCenter.getByText(draftCourse)).toBeVisible();
  await expect(taskCenter.getByText(receiptCourse)).toBeVisible();
  await expect(taskCenter.getByText(reviewCourse)).toBeVisible();
  await expect(taskCenter.getByRole("link", { name: "Continue request" })).toBeVisible();
  await expect(taskCenter.getByRole("link", { name: "Add receipt" })).toBeVisible();
  await expect(taskCenter.getByRole("link", { name: "View status" })).toBeVisible();
  await expect(taskCenter.getByText("Aging").first()).toBeVisible();

  const requestsNav = page.getByRole("link", { name: /My Requests/ }).first();
  await expect(requestsNav.getByText("2", { exact: true })).toBeVisible();
});

test("manager task center and approval badge stay limited to the assigned clinic", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const ownClinicId = await createClinic(`E2E-Task-Center-Own-${Date.now()}`);
  const otherClinicId = await createClinic(`E2E-Task-Center-Other-${Date.now()}`);
  const manager = await provisionUser({ role: "manager", clinicId: ownClinicId });
  const ownEmployee = await provisionUser({
    role: "employee",
    clinicId: ownClinicId,
    managerId: manager.dbId,
  });
  const otherManager = await provisionUser({ role: "manager", clinicId: otherClinicId });
  const otherEmployee = await provisionUser({
    role: "employee",
    clinicId: otherClinicId,
    managerId: otherManager.dbId,
  });
  const ownCourse = `E2E Own Clinic Approval ${Date.now()}`;
  const otherCourse = `E2E Other Clinic Approval ${Date.now()}`;

  await insertRequest({
    employeeId: ownEmployee.dbId,
    managerId: manager.dbId,
    status: "pending_manager",
    courseNames: ownCourse,
    totalRequested: 450,
    updatedAt: new Date(Date.now() - 10 * DAY_MS),
  });
  await insertRequest({
    employeeId: otherEmployee.dbId,
    managerId: otherManager.dbId,
    status: "pending_manager",
    courseNames: otherCourse,
    totalRequested: 900,
    updatedAt: new Date(Date.now() - 10 * DAY_MS),
  });

  await signInAs(manager);
  await page.goto("/dashboard");

  const taskCenter = page.getByRole("region", { name: "Needs attention" });
  await expect(taskCenter.getByText(ownCourse)).toBeVisible();
  await expect(taskCenter.getByText(otherCourse)).toHaveCount(0);
  await expect(taskCenter.getByText("Needs follow-up")).toBeVisible();
  await expect(taskCenter.getByRole("link", { name: "Review" })).toHaveAttribute(
    "href",
    /selected=/,
  );

  const approvalsNav = page.getByRole("link", { name: /Approvals/ }).first();
  await expect(approvalsNav.getByText("1", { exact: true })).toBeVisible();
});
