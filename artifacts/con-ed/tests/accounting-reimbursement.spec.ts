import { test, expect } from "./fixtures";
import { createClinic, insertReceipt, insertRequest, getRequest, getReimbursement } from "./helpers/db";

/**
 * Accounting processes requests that have a submitted receipt. The dashboard
 * shows the queue; marking a request reimbursed (with a paycheck date) moves
 * it to `reimbursed`.
 */
test("accounting marks a request reimbursed -> reimbursed", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-acct`);
  const accounting = await provisionUser({ role: "accounting" });
  const employee = await provisionUser({ role: "employee", clinicId });
  const courseName = `E2E Reimbursement Course ${Date.now()}`;
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    status: "receipt_submitted",
    courseNames: courseName,
    tuition: 300,
    totalRequested: 300,
    approvedTuition: 300,
    totalApproved: 300,
  });
  await insertReceipt(requestId);

  await signInAs(accounting);

  // Accounting dashboard shows the "Ready for Reimbursement" task panel.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Ready for Reimbursement" })).toBeVisible();

  // Navigate to the request detail page and confirm the course name is shown.
  await page.goto(`/requests/${requestId}`);
  await expect(page.getByText(courseName)).toBeVisible();

  await page.getByRole("button", { name: "Mark Reimbursed" }).click();
  await page.getByLabel("Actual reimbursement amount").fill("275");
  await page.locator('input[type="date"]').fill("2026-06-30");
  await page.getByRole("button", { name: "Confirm Reimbursement" }).click();

  await expect(
    page.getByRole("heading", { name: /Request #\d+/ }).getByText("Reimbursed"),
  ).toBeVisible();

  const row = await getRequest(requestId);
  expect(row?.status).toBe("reimbursed");
  expect(Number((await getReimbursement(requestId))?.amount)).toBe(275);
});
