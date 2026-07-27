import { test, expect } from "./fixtures";
import { createClinic, insertRequest } from "./helpers/db";

/**
 * Prior-year approved spend that exceeds the annual allocation carries forward
 * as debt, reducing the available allocation in the current year.
 *
 * Setup: employee hired Jan 1 two years ago (full $2,000 allocation each prior
 * year). A $3,000 approved request created last year exceeds that year's
 * allocation by $1,000, so the current year's available allocation drops from
 * $2,000 to $1,000.
 */
test("prior-year overspend shows as carry-forward debt", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const year = new Date().getFullYear();
  const clinicId = await createClinic(`E2E-Clinic-carry`);
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    hireDate: `${year - 2}-01-01`,
  });

  await insertRequest({
    employeeId: employee.dbId,
    status: "awaiting_receipt",
    courseNames: "E2E Prior-Year Overspend Course",
    tuition: 3000,
    totalRequested: 3000,
    totalApproved: 3000,
    createdAt: new Date(year - 1, 5, 15),
  });

  await signInAs(employee);
  await page.goto("/requests/new");

  // The available budget value sits in the span immediately after its label;
  // likewise for carry-forward debt. Assert each value against its own label so
  // a single duplicated currency string can't mask a wrong number.
  await expect(
    page
      .getByText("Available now")
      .locator("xpath=following-sibling::dd[1]"),
  ).toHaveText("$1,000.00");
  await expect(
    page
      .getByText("Existing future debt")
      .locator("xpath=following-sibling::dd[1]"),
  ).toHaveText("$1,000.00");
});

test("current-year approved overspend is explained as advanced funding", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const year = new Date().getFullYear();
  const clinicId = await createClinic(`E2E-Clinic-current-advance`);
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    hireDate: `${year - 1}-01-01`,
  });

  await insertRequest({
    employeeId: employee.dbId,
    status: "awaiting_receipt",
    courseNames: "E2E Current-Year Advanced Funding",
    tuition: 2500,
    totalRequested: 2500,
    totalApproved: 2500,
    createdAt: new Date(year, 5, 15),
  });

  await signInAs(employee);
  await page.goto("/dashboard");

  await expect(
    page.getByText(
      "$500.00 approved as advanced funding; this reduces a future year's CE benefit",
    ),
  ).toBeVisible();
});
