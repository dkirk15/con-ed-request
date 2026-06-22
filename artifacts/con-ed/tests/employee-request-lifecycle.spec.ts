import { test, expect } from "./fixtures";
import { createClinic, getRequest } from "./helpers/db";

function requestIdFromUrl(url: string): number {
  const match = url.match(/\/requests\/(\d+)/);
  if (!match) throw new Error(`No request id in URL: ${url}`);
  return Number(match[1]);
}

/**
 * An employee fills the New Request form within budget. The form creates the
 * draft and immediately submits it, so it lands in `pending_manager`.
 */
test("employee creates and submits an in-budget request", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-newreq`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });

  await signInAs(employee);
  await page.goto("/requests/new");

  await page
    .getByLabel("Course Name(s)")
    .fill("E2E Advanced Manual Therapy");
  // Cost inputs wrap the <input> in a div for the "$" prefix, so the label's
  // htmlFor lands on the wrapper, not the input — target by the cost-only step.
  await page.locator('input[step="0.01"]').first().fill("500");

  await page.getByRole("button", { name: "Submit Request" }).click();

  await expect(page).toHaveURL(/\/requests\/\d+/);
  await expect(page.getByText("Pending Manager Approval")).toBeVisible();

  const id = requestIdFromUrl(page.url());
  const row = await getRequest(id);
  expect(row?.status).toBe("pending_manager");
  expect(Number(row?.total_requested)).toBe(500);
  expect(row?.requires_repayment_guarantee).toBe(false);
});
