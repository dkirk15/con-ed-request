import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest } from "./helpers/db";

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
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    status: "receipt_submitted",
    courseNames: "E2E Reimbursement Course",
    tuition: 300,
    totalRequested: 300,
    approvedTuition: 300,
    totalApproved: 300,
  });

  await signInAs(accounting);

  // Accounting dashboard shows the request in the "Ready for Reimbursement" queue.
  // CardTitle renders as a <div>, not a heading element, so use getByText.
  await page.goto("/dashboard");
  await expect(page.getByText("Ready for Reimbursement")).toBeVisible();
  // The accounting queue card lists the course name of the seeded request.
  await expect(page.getByText("E2E Reimbursement Course")).toBeVisible();

  await page.goto(`/requests/${requestId}`);

  await page.getByRole("button", { name: "Mark Reimbursed" }).click();
  await page.locator('input[type="date"]').fill("2026-06-30");
  await page.getByRole("button", { name: "Confirm Reimbursement" }).click();

  await expect(
    page.getByRole("heading", { name: /Request #\d+/ }).getByText("Reimbursed"),
  ).toBeVisible();

  const row = await getRequest(requestId);
  expect(row?.status).toBe("reimbursed");
});
