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
  const admin = await provisionUser({ role: "admin", clinicId });

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

  // API contract: the request-detail response must surface the audit trail too.
  const apiGuarantee = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (window as any).Clerk?.session?.getToken();
      const res = await fetch(`/api/requests/${args.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      return body.repaymentGuarantee;
    },
    { id },
  );
  expect(apiGuarantee).toBeTruthy();
  expect(apiGuarantee.acknowledged).toBe(true);
  expect(apiGuarantee.email).toBe(employee.email);
  expect(apiGuarantee.ipAddress).toBeTruthy();
  expect(apiGuarantee.sessionId).toBeTruthy();

  // Admin/manager Users directory must surface the signed agreement inline and
  // make it viewable.
  await signInAs(admin);
  await page.goto("/users");

  const employeeRow = page.getByRole("row").filter({ hasText: employee.name });
  const viewAgreement = employeeRow.getByRole("button", { name: /View/ });
  await expect(viewAgreement).toBeVisible();
  await viewAgreement.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Olympic Sports & Spine");
  await expect(dialog).toContainText(employee.name);
  await expect(dialog).toContainText(`Request #${id}`);
  // Both the user-entered date and the server-recorded timestamp must surface.
  await expect(dialog).toContainText("Date Signed");
  await expect(dialog).toContainText("Recorded On");
});
