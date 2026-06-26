import { test, expect } from "./fixtures";
import {
  createClinic,
  insertRequest,
  getRequest,
  getRepaymentGuarantee,
} from "./helpers/db";

function requestIdFromUrl(url: string): number {
  const match = url.match(/\/requests\/(\d+)/);
  if (!match) throw new Error(`No request id in URL: ${url}`);
  return Number(match[1]);
}

/**
 * When a new request exceeds the employee's remaining budget, the form requires
 * a signed repayment guarantee. Submitting flags the request and persists a
 * repayment_guarantee row.
 *
 * Setup: a $2,000 approved request this year consumes the full allocation, so
 * remaining budget is $0 and any new request is over budget.
 */
test("over-budget request requires and records a repayment guarantee", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-guarantee`);
  const employee = await provisionUser({ role: "employee", clinicId });

  await insertRequest({
    employeeId: employee.dbId,
    status: "awaiting_receipt",
    courseNames: "E2E Budget Consumer Course",
    tuition: 2000,
    totalRequested: 2000,
    totalApproved: 2000,
  });

  await signInAs(employee);
  await page.goto("/requests/new");

  await page.getByLabel("Course Name(s)").fill("E2E Over-Budget Course");
  // Cost inputs wrap the <input> in a div for the "$" prefix; target by step.
  await page.locator('input[step="0.01"]').first().fill("500");

  await expect(page.getByText(/Over budget/)).toBeVisible();

  // Submit must stay disabled until both the acknowledgment box is ticked and a
  // name is typed — the acknowledgment is a hard requirement for over-budget.
  const submitButton = page.getByRole("button", { name: "Submit Request" });

  await page
    .getByPlaceholder("Type your full name to sign")
    .fill(employee.name);
  await expect(submitButton).toBeDisabled();

  await page.getByRole("checkbox").check();
  await expect(submitButton).toBeEnabled();

  await submitButton.click();

  await expect(page).toHaveURL(/\/requests\/\d+/);

  const id = requestIdFromUrl(page.url());
  const row = await getRequest(id);
  expect(row?.status).toBe("pending_manager");
  expect(row?.requires_repayment_guarantee).toBe(true);

  const guarantee = await getRepaymentGuarantee(id);
  expect(guarantee).toBeTruthy();
  // Acknowledgment + audit trail must be persisted server-side.
  expect(guarantee?.acknowledged).toBe(true);
  expect(guarantee?.email).toBe(employee.email);
  expect(guarantee?.ip_address).toBeTruthy();
  expect(guarantee?.session_id).toBeTruthy();
});
