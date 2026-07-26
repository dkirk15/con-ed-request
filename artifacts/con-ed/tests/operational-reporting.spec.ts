import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import {
  createClinic,
  insertReimbursement,
  insertRequest,
  insertUser,
} from "./helpers/db";

const year = new Date().getFullYear();
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function dataUser(clinicId: number, label: string) {
  const suffix = unique();
  return insertUser({
    clerkId: `report-data-${suffix}`,
    name: `${label} ${suffix}`,
    email: `report.${suffix}@example.test`,
    role: "employee",
    clinicId,
  });
}

test("admin reviews financial totals and exports the filtered ledger", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Reports-${unique()}`);
  const employeeId = await dataUser(clinicId, "Report Employee");
  const accountingId = await insertUser({
    clerkId: `report-accounting-${unique()}`,
    name: "Report Accounting",
    email: `report.accounting.${unique()}@example.test`,
    role: "accounting",
  });

  await insertRequest({
    employeeId,
    status: "pending_manager",
    courseNames: `Pending Leadership ${unique()}`,
    totalRequested: 100,
    createdAt: new Date(`${year}-02-01T12:00:00Z`),
    updatedAt: new Date(Date.now() - 3 * 86_400_000),
  });
  await insertRequest({
    employeeId,
    status: "awaiting_receipt",
    courseNames: `Approved Mobility ${unique()}`,
    totalRequested: 300,
    totalApproved: 250,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
    updatedAt: new Date(Date.now() - 5 * 86_400_000),
  });
  const reimbursedCourse = `Reimbursed Strength ${unique()}`;
  const reimbursedId = await insertRequest({
    employeeId,
    status: "reimbursed",
    courseNames: reimbursedCourse,
    courseProvider: "E2E Reporting Institute",
    totalRequested: 500,
    totalApproved: 400,
    createdAt: new Date(`${year}-04-01T12:00:00Z`),
  });
  await insertReimbursement({
    requestId: reimbursedId,
    amount: 350,
    paycheckDate: `${year}-05-01`,
    markedById: accountingId,
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);

  // Regression check: /reports/options must return HTTP 200 with valid filter data.
  // The endpoint previously crashed with "SELECT DISTINCT … ORDER BY" when the
  // ORDER BY expression was not in the select list; it now uses GROUP BY instead.
  const optionsRespPromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/reports/options") && resp.status() === 200,
    { timeout: 15_000 },
  );
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}`);
  const optionsResp = await optionsRespPromise;
  const optionsBody = await optionsResp.json() as { years: number[]; employees: unknown[] };
  expect(optionsBody.years).toContain(year);
  expect(optionsBody.employees.length).toBeGreaterThan(0);

  const summary = page.getByRole("region", { name: "Financial summary" });
  await expect(summary).toContainText("$900.00");
  await expect(summary).toContainText("$100.00");
  await expect(summary).toContainText("$650.00");
  await expect(summary).toContainText("$350.00");
  await expect(page.getByText(reimbursedCourse)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current view" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`oss-ce-report-${year}.csv`);
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain(reimbursedCourse);
  expect(csv).toContain("E2E Reporting Institute");
  expect(csv).toContain(",350,");
});

test("manager report remains limited to the assigned clinic", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const ownClinicId = await createClinic(`E2E-Manager-Reports-Own-${unique()}`);
  const otherClinicId = await createClinic(`E2E-Manager-Reports-Other-${unique()}`);
  const ownEmployeeId = await dataUser(ownClinicId, "Own Clinic Employee");
  const otherEmployeeId = await dataUser(otherClinicId, "Other Clinic Employee");
  const ownCourse = `Own Clinic Course ${unique()}`;
  const otherCourse = `Other Clinic Course ${unique()}`;

  await insertRequest({
    employeeId: ownEmployeeId,
    status: "pending_manager",
    courseNames: ownCourse,
    totalRequested: 275,
    createdAt: new Date(`${year}-06-01T12:00:00Z`),
  });
  await insertRequest({
    employeeId: otherEmployeeId,
    status: "pending_manager",
    courseNames: otherCourse,
    totalRequested: 975,
    createdAt: new Date(`${year}-06-01T12:00:00Z`),
  });

  const manager = await provisionUser({ role: "manager", clinicId: ownClinicId });
  await signInAs(manager);
  await page.goto(`/reports?year=${year}&clinicId=${otherClinicId}`);

  await expect(page.getByText(ownCourse)).toBeVisible();
  await expect(page.getByText(otherCourse)).toHaveCount(0);
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("region", { name: "Financial summary" }).getByText("$275.00").first()).toBeVisible();
  await expect(page.getByLabel("Clinic")).toHaveCount(0);
});

test("admin filters employees and reviews advanced funding guarantees", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const includedClinic = `E2E-Advance-Included-${unique()}`;
  const excludedClinic = `E2E-Advance-Excluded-${unique()}`;
  const includedClinicId = await createClinic(includedClinic);
  const excludedClinicId = await createClinic(excludedClinic);
  const includedEmployeeId = await dataUser(includedClinicId, "Advance Employee");
  const excludedEmployeeId = await dataUser(excludedClinicId, "Other Advance Employee");
  const includedCourse = `Advanced Funding ${unique()}`;
  const excludedCourse = `Excluded Funding ${unique()}`;
  const advancedRequestId = await insertRequest({
    employeeId: includedEmployeeId,
    status: "draft",
    courseNames: includedCourse,
    totalRequested: 2600,
    requiresRepaymentGuarantee: true,
    createdAt: new Date(`${year}-07-01T12:00:00Z`),
  });
  await insertRequest({
    employeeId: excludedEmployeeId,
    status: "draft",
    courseNames: excludedCourse,
    totalRequested: 2800,
    requiresRepaymentGuarantee: true,
    createdAt: new Date(`${year}-07-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}`);

  await page.getByRole("combobox", { name: "Clinic" }).click();
  await page.getByRole("option", { name: includedClinic }).click();
  await page.getByRole("combobox", { name: "Employee" }).click();
  await page.getByPlaceholder("Search employees…").fill("Advance Employee");
  await page.getByRole("option", { name: /Advance Employee/ }).click();

  await page.getByRole("tab", { name: "Funding & advances" }).click();
  await expect(page.getByRole("heading", { name: "Advanced funding and repayment guarantees" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Request #${advancedRequestId}` })).toBeVisible();
  await expect(page.getByText("Missing", { exact: true })).toBeVisible();
  await expect(page.getByText(excludedCourse)).toHaveCount(0);
  await expect(page.getByLabel("Delivery method")).toHaveCount(0);

  await page.getByRole("button", { name: /Advanced funding/ }).click();
  await expect(page.getByRole("heading", { name: "Request ledger" })).toBeVisible();
  await expect(page.getByText(includedCourse)).toBeVisible();
  await expect(page.getByText(excludedCourse)).toHaveCount(0);
});

test("paycheck-date reporting includes reimbursements for requests from an earlier year", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Paycheck-Date-${unique()}`);
  const employeeId = await dataUser(clinicId, "Paycheck Date Employee");
  const accountingId = await insertUser({
    clerkId: `paycheck-date-accounting-${unique()}`,
    name: "Paycheck Date Accounting",
    email: `paycheck.date.${unique()}@example.test`,
    role: "accounting",
  });
  const course = `Prior Year Request ${unique()}`;
  const requestId = await insertRequest({
    employeeId,
    status: "reimbursed",
    courseNames: course,
    totalRequested: 450,
    totalApproved: 400,
    createdAt: new Date(`${year - 1}-12-15T12:00:00Z`),
  });
  await insertReimbursement({
    requestId,
    amount: 375,
    paycheckDate: `${year}-01-15`,
    markedById: accountingId,
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}`);
  await expect(page.getByText(course)).toHaveCount(0);

  await page.getByRole("combobox", { name: "Measure dates by" }).click();
  await page.getByRole("option", { name: "Paycheck date" }).click();
  await expect(page.getByText(course)).toBeVisible();
  await page.getByRole("tab", { name: "Payroll" }).click();
  await expect(page.getByText("$375.00").first()).toBeVisible();
});

test("budget-usage view shows correct allocation, used, and remaining amounts per employee", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Budget-${unique()}`);

  // Two data-only employees — no Clerk account needed; budget queries the DB directly.
  // calcAnnualAllocationForYear(null, year) → $2,000 (full allocation, no hire-date prorate).
  const empAId = await dataUser(clinicId, "Budget Emp A");
  const empBId = await dataUser(clinicId, "Budget Emp B");

  // Employee A: awaiting_receipt, totalApproved=600 → usedAmount=600, remaining=1400
  await insertRequest({
    employeeId: empAId,
    status: "awaiting_receipt",
    courseNames: `Budget Course A ${unique()}`,
    totalRequested: 700,
    totalApproved: 600,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });

  // Employee B: awaiting_receipt, totalApproved=900 → usedAmount=900, remaining=1100
  await insertRequest({
    employeeId: empBId,
    status: "awaiting_receipt",
    courseNames: `Budget Course B ${unique()}`,
    totalRequested: 1000,
    totalApproved: 900,
    createdAt: new Date(`${year}-04-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  // clinicId scopes budget to only these two employees; section=funding loads the tab directly.
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();

  // Employee A — Available: $2,000.00 | Used: $600.00 | Remaining: $1,400.00
  const rowA = budgetSection.getByRole("row").filter({ hasText: "Budget Emp A" });
  await expect(rowA.getByText("$2,000.00")).toBeVisible();
  await expect(rowA.getByText("$600.00")).toBeVisible();
  await expect(rowA.getByText("$1,400.00")).toBeVisible();

  // Employee B — Available: $2,000.00 | Used: $900.00 | Remaining: $1,100.00
  const rowB = budgetSection.getByRole("row").filter({ hasText: "Budget Emp B" });
  await expect(rowB.getByText("$2,000.00")).toBeVisible();
  await expect(rowB.getByText("$900.00")).toBeVisible();
  await expect(rowB.getByText("$1,100.00")).toBeVisible();
});

test("clinic-comparison tab shows correct totals and denial rate per clinic", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // Unique names prevent interference from prior test runs in the shared database.
  const clinicXName = `E2E-ClinComp-X-${unique()}`;
  const clinicYName = `E2E-ClinComp-Y-${unique()}`;
  const clinicXId = await createClinic(clinicXName);
  const clinicYId = await createClinic(clinicYName);
  const empXId = await dataUser(clinicXId, "Clinic X Employee");
  const empYId = await dataUser(clinicYId, "Clinic Y Employee");

  // Clinic X: 1 pending + 1 manager-denied → 2 submitted, 1 denied → 50% denial rate
  // requested = 150 + 250 = $400.00
  await insertRequest({
    employeeId: empXId,
    status: "pending_manager",
    courseNames: `Clinic X Pending ${unique()}`,
    totalRequested: 150,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });
  await insertRequest({
    employeeId: empXId,
    status: "manager_denied",
    courseNames: `Clinic X Denied ${unique()}`,
    totalRequested: 250,
    createdAt: new Date(`${year}-04-01T12:00:00Z`),
  });

  // Clinic Y: 1 awaiting_receipt, totalApproved=300 → 1 submitted, 0 denied → 0% denial rate
  await insertRequest({
    employeeId: empYId,
    status: "awaiting_receipt",
    courseNames: `Clinic Y Approved ${unique()}`,
    totalRequested: 350,
    totalApproved: 300,
    createdAt: new Date(`${year}-05-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  // No clinicId filter — clinic comparison needs all-clinic scope to build per-clinic rows.
  await page.goto(`/reports?year=${year}&section=clinics`);

  const clinicSection = page.getByRole("region", { name: "Clinic comparison" });
  await expect(clinicSection).toBeVisible();

  // Clinic X row: $400.00 requested, 50% denial rate
  const rowX = clinicSection.getByRole("row").filter({ hasText: clinicXName });
  await expect(rowX.getByText("$400.00")).toBeVisible();
  await expect(rowX.getByText("50%")).toBeVisible();

  // Clinic Y row: $350.00 requested, $300.00 approved, 0% denial rate
  const rowY = clinicSection.getByRole("row").filter({ hasText: clinicYName });
  await expect(rowY.getByText("$350.00")).toBeVisible();
  await expect(rowY.getByText("$300.00")).toBeVisible();
  await expect(rowY.getByText("0%")).toBeVisible();
});

test("exception strip flags a stale pending request with the correct count", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Exception-${unique()}`);
  const empId = await dataUser(clinicId, "Exception Employee");

  // pending_manager updated 8 days ago:
  //   ageDays >= 3 → exception triggered ("stale_approvals")
  //   ageDays >= 7 → severity = "follow_up" (red icon)
  await insertRequest({
    employeeId: empId,
    status: "pending_manager",
    courseNames: `Stale Approval ${unique()}`,
    totalRequested: 500,
    createdAt: new Date(`${year}-01-15T12:00:00Z`),
    updatedAt: new Date(Date.now() - 8 * 86_400_000),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  // clinicId scope ensures only this test's request appears in the exception count.
  // Overview is admin's default section so no section param is needed.
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}`);

  // ExceptionStrip renders in both "overview" and "workflow" tab panels; .first() targets
  // the overview panel, which is the active (visible) tab.
  const exceptionRegion = page.getByRole("region", { name: "Needs attention" }).first();
  await expect(exceptionRegion).toBeVisible();

  // "Approval follow-up" button should be present with count = 1
  const approvalFlag = exceptionRegion.getByRole("button", { name: /Approval follow-up/ });
  await expect(approvalFlag).toBeVisible();
  await expect(approvalFlag).toContainText("1");
});

test("business-office user sees employees from all clinics in the budget-usage view", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // Two distinct clinics — unique names prevent row collisions with other test runs.
  // We filter budget rows by clinic name (not employee name) because BO sees ALL
  // employees in the DB and prior runs also created "BO Alpha/Beta Employee" rows.
  const clinicAlphaName = `E2E-BO-Alpha-${unique()}`;
  const clinicBetaName = `E2E-BO-Beta-${unique()}`;
  const clinicAlphaId = await createClinic(clinicAlphaName);
  const clinicBetaId = await createClinic(clinicBetaName);
  const empAlphaId = await dataUser(clinicAlphaId, "BO Alpha Employee");
  const empBetaId = await dataUser(clinicBetaId, "BO Beta Employee");

  // Give each employee an approved request so their rows carry real numbers.
  await insertRequest({
    employeeId: empAlphaId,
    status: "awaiting_receipt",
    courseNames: `Alpha Course ${unique()}`,
    totalRequested: 400,
    totalApproved: 400,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });
  await insertRequest({
    employeeId: empBetaId,
    status: "awaiting_receipt",
    courseNames: `Beta Course ${unique()}`,
    totalRequested: 600,
    totalApproved: 600,
    createdAt: new Date(`${year}-04-01T12:00:00Z`),
  });

  const bo = await provisionUser({ role: "business_office" });
  await signInAs(bo);
  // No clinicId param — BO must see all clinics without any restriction.
  // The default section for BO is "funding" (Funding & advances).
  await page.goto(`/reports?year=${year}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();

  // Both clinics must appear — confirming cross-clinic scope for BO.
  // Filtered by unique clinic name (not employee label) so prior test runs' rows
  // don't cause a strict-mode violation in the all-employee BO view.
  await expect(budgetSection.getByRole("row").filter({ hasText: clinicAlphaName })).toBeVisible();
  await expect(budgetSection.getByRole("row").filter({ hasText: clinicBetaName })).toBeVisible();

  // BO has the Clinic dropdown available (can optionally narrow scope, but is not
  // locked to one clinic the way a manager is).
  await expect(page.getByLabel("Clinic")).toBeVisible();

  // BO does not see the "Clinics" comparison tab (that view is admin-only).
  await expect(page.getByRole("tab", { name: "Clinics" })).toHaveCount(0);
});
