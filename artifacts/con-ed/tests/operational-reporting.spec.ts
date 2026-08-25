import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import {
  createClinic,
  insertReimbursement,
  insertRequest,
  insertUser,
  query,
  updateUserAllocation,
} from "./helpers/db";

const year = new Date().getFullYear();
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = csv.charCodeAt(0) === 0xfeff ? 1 : 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" && csv[index + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index += 1;
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

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

test("reports CSV export applies filters and preserves its schema", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const includedClinicId = await createClinic(`E2E-Export-Included-${unique()}`);
  const excludedClinicId = await createClinic(`E2E-Export-Excluded-${unique()}`);
  const includedEmployeeId = await dataUser(includedClinicId, "Export Included");
  const excludedEmployeeId = await dataUser(excludedClinicId, "Export Excluded");
  const pendingCourse = `Export Pending ${unique()}`;
  const reimbursedCourse = `Export Reimbursed ${unique()}`;
  const excludedCourse = `Export Excluded ${unique()}`;

  await insertRequest({
    employeeId: includedEmployeeId,
    status: "pending_manager",
    courseNames: pendingCourse,
    courseProvider: "CSV Test Provider",
    deliveryMethod: "virtual",
    totalRequested: 125,
    createdAt: new Date(`${year}-01-15T12:00:00Z`),
  });
  const reimbursedId = await insertRequest({
    employeeId: includedEmployeeId,
    status: "reimbursed",
    courseNames: reimbursedCourse,
    courseProvider: "CSV Test Provider",
    deliveryMethod: "in_person",
    totalRequested: 450,
    totalApproved: 400,
    createdAt: new Date(`${year}-02-15T12:00:00Z`),
  });
  const accountingId = await insertUser({
    clerkId: `report-export-accounting-${unique()}`,
    name: "Export Accounting",
    email: `report.export.accounting.${unique()}@example.test`,
    role: "accounting",
  });
  await insertReimbursement({
    requestId: reimbursedId,
    amount: 375,
    paycheckDate: `${year}-03-01`,
    markedById: accountingId,
  });
  await insertRequest({
    employeeId: excludedEmployeeId,
    status: "pending_manager",
    courseNames: excludedCourse,
    totalRequested: 999,
    createdAt: new Date(`${year}-03-15T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);

  const exportCsv = async (query: string) => page.evaluate(async (path) => {
    const clerk = (window as Window & {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk;
    const token = await clerk?.session?.getToken();
    const response = await fetch(`/api/reports/export?${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return { status: response.status, text: await response.text() };
  }, query);

  const headers = [
    "Request ID", "Status", "Employee", "Employee Email", "Clinic", "Course",
    "Provider", "Course URL", "Start Date", "End Date", "Location",
    "Requested", "Approved", "Reimbursed", "Created",
    "Manager Decision", "Business Office Decision", "Paycheck Date",
  ];

  const clinicExport = await exportCsv(`year=${year}&clinicId=${includedClinicId}`);
  expect(clinicExport.status).toBe(200);
  const clinicRows = parseCsv(clinicExport.text);
  expect(clinicRows[0]).toEqual(headers);
  expect(clinicRows).toHaveLength(3);
  expect(clinicRows.slice(1).map((row) => row[5]).sort()).toEqual(
    [pendingCourse, reimbursedCourse].sort(),
  );
  expect(clinicRows.slice(1).every((row) => row.length === headers.length)).toBeTruthy();

  const statusExport = await exportCsv(
    `year=${year}&clinicId=${includedClinicId}&status=pending_manager`,
  );
  expect(statusExport.status).toBe(200);
  expect(parseCsv(statusExport.text).slice(1).map((row) => row[5])).toEqual([pendingCourse]);

  const searchExport = await exportCsv(
    `year=${year}&clinicId=${includedClinicId}&search=${encodeURIComponent(reimbursedCourse)}`,
  );
  expect(searchExport.status).toBe(200);
  expect(parseCsv(searchExport.text).slice(1).map((row) => row[5])).toEqual([reimbursedCourse]);

  const otherYearExport = await exportCsv(`year=${year - 1}&clinicId=${includedClinicId}`);
  expect(otherYearExport.status).toBe(200);
  expect(parseCsv(otherYearExport.text)).toHaveLength(1);

  // deliveryMethod is intentionally absent from ExportReportQueryParams. Zod's
  // object parser strips this legacy parameter, so it must not filter the rows.
  const legacyFilterExport = await exportCsv(
    `year=${year}&clinicId=${includedClinicId}&deliveryMethod=virtual`,
  );
  expect(legacyFilterExport.status).toBe(200);
  expect(parseCsv(legacyFilterExport.text)).toHaveLength(3);
});

test("reports CSV export honors each supported date basis", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Export-Date-Basis-${unique()}`);
  const employeeId = await dataUser(clinicId, "Date Basis Employee");
  const previousYear = year - 1;
  const currentYearDate = `${year}-06-15`;
  const previousYearDate = `${previousYear}-06-15`;

  const requestDateMatch = await insertRequest({
    employeeId,
    status: "pending_manager",
    courseNames: `Date basis request ${unique()}`,
    totalRequested: 101,
    courseStartDate: previousYearDate,
    courseEndDate: previousYearDate,
    createdAt: new Date(`${year}-01-15T12:00:00Z`),
  });
  const courseDateMatch = await insertRequest({
    employeeId,
    status: "pending_manager",
    courseNames: `Date basis course ${unique()}`,
    totalRequested: 102,
    courseStartDate: currentYearDate,
    courseEndDate: currentYearDate,
    createdAt: new Date(`${previousYear}-01-15T12:00:00Z`),
  });
  const approvalDateMatch = await insertRequest({
    employeeId,
    status: "manager_approved",
    courseNames: `Date basis approval ${unique()}`,
    totalRequested: 103,
    courseStartDate: previousYearDate,
    courseEndDate: previousYearDate,
    createdAt: new Date(`${previousYear}-02-15T12:00:00Z`),
  });
  const reimbursementDateMatch = await insertRequest({
    employeeId,
    status: "reimbursed",
    courseNames: `Date basis reimbursement ${unique()}`,
    totalRequested: 104,
    totalApproved: 104,
    courseStartDate: previousYearDate,
    courseEndDate: previousYearDate,
    createdAt: new Date(`${previousYear}-03-15T12:00:00Z`),
  });

  await query(
    `UPDATE con_ed_requests
        SET manager_approved_at = CASE id
          WHEN $1 THEN $3::timestamptz
          WHEN $2 THEN $4::timestamptz
        END
      WHERE id IN ($1, $2)`,
    [
      approvalDateMatch,
      reimbursementDateMatch,
      `${year}-04-15T12:00:00Z`,
      `${previousYear}-04-15T12:00:00Z`,
    ],
  );
  const accountingId = await insertUser({
    clerkId: `report-date-basis-accounting-${unique()}`,
    name: "Date Basis Accounting",
    email: `report.date.basis.accounting.${unique()}@example.test`,
    role: "accounting",
  });
  await insertReimbursement({
    requestId: reimbursementDateMatch,
    amount: 104,
    paycheckDate: currentYearDate,
    markedById: accountingId,
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);

  const exportIds = async (dateBasis: "request" | "course" | "approval" | "reimbursement") =>
    page.evaluate(async ({ clinicId, dateBasis, year }) => {
      const clerk = (window as Window & {
        Clerk?: { session?: { getToken: () => Promise<string | null> } };
      }).Clerk;
      const token = await clerk?.session?.getToken();
      const response = await fetch(
        `/api/reports/export?year=${year}&clinicId=${clinicId}&dateBasis=${dateBasis}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      );
      const text = await response.text();
      return { status: response.status, ids: text };
    }, { clinicId, dateBasis, year }).then((result) => {
      expect(result.status).toBe(200);
      return parseCsv(result.ids).slice(1).map((row) => Number(row[0]));
    });

  await expect(exportIds("request")).resolves.toEqual([requestDateMatch]);
  await expect(exportIds("course")).resolves.toEqual([courseDateMatch]);
  await expect(exportIds("approval")).resolves.toEqual([approvalDateMatch]);
  await expect(exportIds("reimbursement")).resolves.toEqual([reimbursementDateMatch]);
});

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

test("current-year mid-year hire receives a prorated budget allocation", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-MidYearHire-${unique()}`);
  const suffix = unique();
  const employeeId = await insertUser({
    clerkId: `report-mid-year-hire-${suffix}`,
    name: `Mid-Year Hire ${suffix}`,
    email: `report.mid-year-hire.${suffix}@example.test`,
    role: "employee",
    clinicId,
    hireDate: `${year}-07-01`,
  });

  // July hire: (13 - 7) / 12 × $2,000 = $1,000 allocation.
  await insertRequest({
    employeeId,
    status: "awaiting_receipt",
    courseNames: `Mid-Year Hire Course ${unique()}`,
    totalRequested: 300,
    totalApproved: 300,
    createdAt: new Date(`${year}-08-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();
  const row = budgetSection.getByRole("row").filter({ hasText: `Mid-Year Hire ${suffix}` });
  const cells = row.getByRole("cell");

  // Available: $1,000 allocation, Used: $300, Remaining: $700, Future debt: $0.
  await expect(cells.nth(2)).toHaveText("$1,000.00");
  await expect(cells.nth(3)).toHaveText("$300.00");
  await expect(cells.nth(5)).toHaveText("$700.00");
  await expect(cells.nth(6)).toHaveText("$0.00");
});

test("budget boundaries allocate January fully and December for one month", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Budget-Boundaries-${unique()}`);
  const januarySuffix = unique();
  const decemberSuffix = unique();
  const priorDecemberSuffix = unique();

  const januaryEmployeeId = await insertUser({
    clerkId: `budget-january-${januarySuffix}`,
    name: `January Boundary Employee ${januarySuffix}`,
    email: `budget.january.${januarySuffix}@example.test`,
    role: "employee",
    clinicId,
    hireDate: `${year}-01-01`,
  });
  const decemberEmployeeId = await insertUser({
    clerkId: `budget-december-${decemberSuffix}`,
    name: `December Boundary Employee ${decemberSuffix}`,
    email: `budget.december.${decemberSuffix}@example.test`,
    role: "employee",
    clinicId,
    hireDate: `${year}-12-01`,
  });
  const priorDecemberEmployeeId = await insertUser({
    clerkId: `budget-prior-december-${priorDecemberSuffix}`,
    name: `Prior December Employee ${priorDecemberSuffix}`,
    email: `budget.prior.december.${priorDecemberSuffix}@example.test`,
    role: "employee",
    clinicId,
    hireDate: `${year - 1}-12-01`,
  });

  await insertRequest({
    employeeId: januaryEmployeeId,
    status: "awaiting_receipt",
    courseNames: `January Boundary Course ${unique()}`,
    totalRequested: 300,
    totalApproved: 300,
    createdAt: new Date(`${year}-01-15T12:00:00Z`),
  });
  await insertRequest({
    employeeId: decemberEmployeeId,
    status: "awaiting_receipt",
    courseNames: `December Boundary Course ${unique()}`,
    totalRequested: 25,
    totalApproved: 25,
    createdAt: new Date(`${year}-12-15T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });

  const januaryRow = budgetSection.getByRole("row").filter({ hasText: `January Boundary Employee ${januarySuffix}` });
  await expect(januaryRow.getByRole("cell").nth(2)).toHaveText("$2,000.00");
  await expect(januaryRow.getByRole("cell").nth(3)).toHaveText("$300.00");
  await expect(januaryRow.getByRole("cell").nth(5)).toHaveText("$1,700.00");

  // December receives one month: round($2,000 / 12) = $166.67.
  const decemberRow = budgetSection.getByRole("row").filter({ hasText: `December Boundary Employee ${decemberSuffix}` });
  await expect(decemberRow.getByRole("cell").nth(2)).toHaveText("$166.67");
  await expect(decemberRow.getByRole("cell").nth(3)).toHaveText("$25.00");
  await expect(decemberRow.getByRole("cell").nth(5)).toHaveText("$141.67");

  // A December hire from the prior year is no longer prorated in this year.
  const priorDecemberRow = budgetSection.getByRole("row").filter({ hasText: `Prior December Employee ${priorDecemberSuffix}` });
  await expect(priorDecemberRow.getByRole("cell").nth(2)).toHaveText("$2,000.00");
  await expect(priorDecemberRow.getByRole("cell").nth(3)).toHaveText("$0.00");
  await expect(priorDecemberRow.getByRole("cell").nth(5)).toHaveText("$2,000.00");
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

test("carry-forward debt from a prior year reduces the employee's available allocation", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // Employee has no hireDate → full $2,000 allocation every year.
  // Prior year: reimbursed request for $2,500 (over allocation by $500).
  //   carryoverDebt = max(0, $2,500 - $2,000) = $500
  // Current year: awaiting_receipt with totalApproved = $300.
  //   availableAllocation = max(0, $2,000 - $500) = $1,500
  //   usedAmount         = $300
  //   remainingAmount    = max(0, $1,500 - $300) = $1,200
  //   Future debt column = carryoverDebt + advancedExposure = $500 + 0 = $500

  const clinicId = await createClinic(`E2E-Carryover-${unique()}`);
  const empId = await dataUser(clinicId, "Carryover Employee");

  // Prior-year reimbursed request — exceeds the $2,000 allocation by $500.
  // buildBudgetUsage uses `reimbursementAmount ?? totalApproved ?? totalRequested`;
  // setting totalApproved=2500 is sufficient (no reimbursement row needed).
  await insertRequest({
    employeeId: empId,
    status: "reimbursed",
    courseNames: `Prior Year Over-Budget ${unique()}`,
    totalRequested: 2500,
    totalApproved: 2500,
    createdAt: new Date(`${year - 1}-06-15T12:00:00Z`),
  });

  // Current-year request — partially uses the reduced $1,500 available allocation.
  await insertRequest({
    employeeId: empId,
    status: "awaiting_receipt",
    courseNames: `Current Year Course ${unique()}`,
    totalRequested: 400,
    totalApproved: 300,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();

  const row = budgetSection.getByRole("row").filter({ hasText: "Carryover Employee" });

  // Available = annual allocation ($2,000) minus carry-forward debt ($500) = $1,500
  await expect(row.getByText("$1,500.00")).toBeVisible();
  // Used = current-year approved amount
  await expect(row.getByText("$300.00")).toBeVisible();
  // Remaining = available − used = $1,200
  await expect(row.getByText("$1,200.00")).toBeVisible();
  // Future debt column = carryoverDebt ($500) + advancedExposure ($0)
  await expect(row.getByText("$500.00")).toBeVisible();
});

test("consecutive prior-year overspend accumulates carry-forward debt", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // No hireDate → $2,000 allocation in each year.
  // Year - 2: $2,500 spend → debt = max(0, 0 + 2,500 - 2,000) = $500.
  // Year - 1: $2,500 spend → debt = max(0, 500 + 2,500 - 2,000) = $1,000.
  // Current year: available = $2,000 - $1,000 = $1,000.
  // After $300 approved this year, remaining = $700 and future debt = $1,000.
  const clinicId = await createClinic(`E2E-ConsecutiveCarryover-${unique()}`);
  const empId = await dataUser(clinicId, "Consecutive Carryover Employee");

  for (const priorYear of [year - 2, year - 1]) {
    await insertRequest({
      employeeId: empId,
      status: "reimbursed",
      courseNames: `Prior Year ${priorYear} Over-Budget ${unique()}`,
      totalRequested: 2500,
      totalApproved: 2500,
      createdAt: new Date(`${priorYear}-06-15T12:00:00Z`),
    });
  }

  await insertRequest({
    employeeId: empId,
    status: "awaiting_receipt",
    courseNames: `Current Year Consecutive Course ${unique()}`,
    totalRequested: 400,
    totalApproved: 300,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();
  const row = budgetSection.getByRole("row").filter({ hasText: "Consecutive Carryover Employee" });
  const cells = row.getByRole("cell");

  await expect(cells.nth(2)).toHaveText("$1,000.00");
  await expect(cells.nth(3)).toHaveText("$300.00");
  await expect(cells.nth(5)).toHaveText("$700.00");
  await expect(cells.nth(6)).toHaveText("$1,000.00");
});

test("underspending after a prior overspend pays down carry-forward debt", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // No hireDate → $2,000 allocation in each year.
  // Year - 2: $2,500 spend → debt = max(0, 0 + 2,500 - 2,000) = $500.
  // Year - 1: $1,000 spend → debt = max(0, 500 + 1,000 - 2,000) = 0.
  // Current year: available = $2,000, used = $300, remaining = $1,700.
  const clinicId = await createClinic(`E2E-PaydownCarryover-${unique()}`);
  const empId = await dataUser(clinicId, "Paydown Carryover Employee");

  await insertRequest({
    employeeId: empId,
    status: "reimbursed",
    courseNames: `Prior Year Overspend for Paydown ${unique()}`,
    totalRequested: 2500,
    totalApproved: 2500,
    createdAt: new Date(`${year - 2}-06-15T12:00:00Z`),
  });
  await insertRequest({
    employeeId: empId,
    status: "reimbursed",
    courseNames: `Later Year Underspend for Paydown ${unique()}`,
    totalRequested: 1000,
    totalApproved: 1000,
    createdAt: new Date(`${year - 1}-06-15T12:00:00Z`),
  });
  await insertRequest({
    employeeId: empId,
    status: "awaiting_receipt",
    courseNames: `Current Year Paydown Course ${unique()}`,
    totalRequested: 400,
    totalApproved: 300,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();
  const row = budgetSection.getByRole("row").filter({ hasText: "Paydown Carryover Employee" });
  const cells = row.getByRole("cell");

  await expect(cells.nth(2)).toHaveText("$2,000.00");
  await expect(cells.nth(3)).toHaveText("$300.00");
  await expect(cells.nth(5)).toHaveText("$1,700.00");
  await expect(cells.nth(6)).toHaveText("$0.00");

  await page.waitForFunction(() => Boolean(
    (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
  ));
  const balance = await page.evaluate(async (userId: number) => {
    const token = await (window as Window & {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk?.session?.getToken();
    const response = await fetch(`/api/users/${userId}/balance`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return { status: response.status, data: await response.json() };
  }, empId);

  expect(balance.status).toBe(200);
  expect(balance.data).toMatchObject({
    annualAllocation: 2000,
    availableAllocation: 2000,
    carryoverDebt: 0,
    usedAmount: 300,
    remainingAmount: 1700,
  });
});

test("manual allocation override is used when computing carry-forward debt", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // The employee's manual $3,000 allocation is explicitly assigned to both years.
  // Prior-year reimbursed spend = $3,500 → carryoverDebt = $500.
  // Current-year available = $3,000 - $500 = $2,500.
  // Current-year used = $300 → remaining = $2,200.
  // Future debt = carryoverDebt ($500) + advancedExposure ($0) = $500.
  const clinicId = await createClinic(`E2E-OverrideCarryover-${unique()}`);
  const empId = await dataUser(clinicId, "Override Carryover Employee");
  await updateUserAllocation(empId, 3000, year - 1);
  await updateUserAllocation(empId, 3000, year);

  await insertRequest({
    employeeId: empId,
    status: "reimbursed",
    courseNames: `Prior Year Override Over-Budget ${unique()}`,
    totalRequested: 3500,
    totalApproved: 3500,
    createdAt: new Date(`${year - 1}-06-15T12:00:00Z`),
  });
  await insertRequest({
    employeeId: empId,
    status: "awaiting_receipt",
    courseNames: `Current Year Override Course ${unique()}`,
    totalRequested: 400,
    totalApproved: 300,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();
  const row = budgetSection.getByRole("row").filter({ hasText: "Override Carryover Employee" });

  await expect(row.getByText("$2,500.00")).toBeVisible();
  await expect(row.getByText("$300.00")).toBeVisible();
  await expect(row.getByText("$2,200.00")).toBeVisible();
  await expect(row.getByText("$500.00")).toBeVisible();
});

test("year-specific overrides preserve prior debt when the current override changes", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Yearly-Override-${unique()}`);
  const empId = await dataUser(clinicId, "Yearly Override Employee");

  // The prior year's $3,000 override creates $500 debt from $3,500 of spend.
  // The current year's $4,000 override must not be applied retroactively.
  await updateUserAllocation(empId, 3000, year - 1);
  await updateUserAllocation(empId, 4000, year);
  await insertRequest({
    employeeId: empId,
    status: "reimbursed",
    courseNames: `Yearly Override Prior Course ${unique()}`,
    totalRequested: 3500,
    totalApproved: 3500,
    createdAt: new Date(`${year - 1}-06-15T12:00:00Z`),
  });
  await insertRequest({
    employeeId: empId,
    status: "awaiting_receipt",
    courseNames: `Yearly Override Current Course ${unique()}`,
    totalRequested: 400,
    totalApproved: 300,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);
  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  const row = budgetSection.getByRole("row").filter({ hasText: "Yearly Override Employee" });

  // $4,000 current allocation − unchanged $500 historical debt.
  await expect(row.getByText("$3,500.00")).toBeVisible();
  await expect(row.getByText("$500.00")).toBeVisible();

  // Clearing only the current-year override restores the normal $2,000 current
  // allocation; the prior year's $500 debt remains unchanged.
  await updateUserAllocation(empId, null, year);
  await page.reload();
  await expect(row.getByText("$1,500.00")).toBeVisible();
  await expect(row.getByText("$500.00")).toBeVisible();
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
  await expect(page.getByRole("combobox", { name: "Clinic" })).toBeVisible();

  // BO does not see the "Clinics" comparison tab (that view is admin-only).
  await expect(page.getByRole("tab", { name: "Clinics" })).toHaveCount(0);
});

test("quick view badges show the correct count and the ledger total matches after clicking", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-QuickViews-${unique()}`);
  // One data-only employee per request so request counts are unambiguous.
  const emp1Id = await dataUser(clinicId, "QV Emp 1");
  const emp2Id = await dataUser(clinicId, "QV Emp 2");
  const emp3Id = await dataUser(clinicId, "QV Emp 3");
  const emp4Id = await dataUser(clinicId, "QV Emp 4");
  const emp5Id = await dataUser(clinicId, "QV Emp 5");

  // "Needs approval" quick view for admin = pending_manager ∪ pending_bo.
  // 2 pending_manager + 1 pending_bo → badge count = 3; ledger total after clicking = 3.
  await insertRequest({
    employeeId: emp1Id,
    status: "pending_manager",
    courseNames: `QV Pending Manager A ${unique()}`,
    totalRequested: 200,
    createdAt: new Date(`${year}-02-01T12:00:00Z`),
  });
  await insertRequest({
    employeeId: emp2Id,
    status: "pending_manager",
    courseNames: `QV Pending Manager B ${unique()}`,
    totalRequested: 300,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });
  await insertRequest({
    employeeId: emp3Id,
    status: "pending_bo",
    courseNames: `QV Pending BO ${unique()}`,
    totalRequested: 400,
    createdAt: new Date(`${year}-04-01T12:00:00Z`),
  });

  // "Awaiting receipts" quick view = awaiting_receipt.
  // 2 awaiting_receipt requests → badge count = 2; ledger total after clicking = 2.
  await insertRequest({
    employeeId: emp4Id,
    status: "awaiting_receipt",
    courseNames: `QV Awaiting Receipt A ${unique()}`,
    totalRequested: 500,
    totalApproved: 450,
    createdAt: new Date(`${year}-05-01T12:00:00Z`),
  });
  await insertRequest({
    employeeId: emp5Id,
    status: "awaiting_receipt",
    courseNames: `QV Awaiting Receipt B ${unique()}`,
    totalRequested: 600,
    totalApproved: 550,
    createdAt: new Date(`${year}-06-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  // clinicId scopes both the quickView counts and the ledger to only these 5 requests.
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}`);

  const quickViewsSection = page.getByRole("region", { name: "Quick views" });
  const ledgerSection = page.getByRole("region", { name: "Request ledger" });

  // --- "Needs approval" ---
  const needsApprovalBtn = quickViewsSection.getByRole("button", { name: /Needs approval/ });
  // toContainText waits through the initial loading skeleton.
  await expect(needsApprovalBtn).toContainText("3");

  // Clicking updates ?view=needs_approval and triggers a new API call; the new
  // response's `total` reflects only pending_manager + pending_bo rows.
  await needsApprovalBtn.click();
  // Ledger subtitle: "{total} matching requests in needs approval"
  await expect(ledgerSection.getByText(/3 matching requests/)).toBeVisible();

  // --- "Awaiting receipts" ---
  // quickView counts are view-independent (unviewedWhere has no view filter),
  // so the badge on "Awaiting receipts" is correct regardless of the active view.
  const awaitingReceiptsBtn = quickViewsSection.getByRole("button", { name: /Awaiting receipts/ });
  await expect(awaitingReceiptsBtn).toContainText("2");

  await awaitingReceiptsBtn.click();
  await expect(ledgerSection.getByText(/2 matching requests/)).toBeVisible();
});

test("business-office Clinic filter scopes the budget view to the selected clinic only", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // Unique clinic names prevent cross-test row collisions in the shared DB.
  const clinicAlphaName = `E2E-BOFilt-Alpha-${unique()}`;
  const clinicBetaName = `E2E-BOFilt-Beta-${unique()}`;
  const clinicAlphaId = await createClinic(clinicAlphaName);
  const clinicBetaId = await createClinic(clinicBetaName);
  // Data-only employees — no requests needed; buildBudgetUsage includes every
  // employee matching the clinic filter, even those with zero activity.
  await dataUser(clinicAlphaId, "BO Filt Alpha Emp");
  await dataUser(clinicBetaId, "BO Filt Beta Emp");

  const bo = await provisionUser({ role: "business_office" });
  await signInAs(bo);
  // No clinicId param — start in the all-clinic unfiltered view.
  await page.goto(`/reports?year=${year}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });

  // Confirm the starting (unfiltered) state: both clinics' employees are present.
  await expect(budgetSection.getByRole("row").filter({ hasText: clinicAlphaName })).toBeVisible();
  await expect(budgetSection.getByRole("row").filter({ hasText: clinicBetaName })).toBeVisible();

  // Apply the Clinic filter — select clinicAlpha.
  await page.getByRole("combobox", { name: "Clinic" }).click();
  await page.getByRole("option", { name: clinicAlphaName }).click();

  // Wait for the filtered view to finish loading. budgetSection enters a loading
  // skeleton when the query key changes (new clinicId), so toBeVisible() on the
  // clinicAlpha row waits through that skeleton and succeeds only once the
  // re-fetch completes with the narrowed data.
  await expect(budgetSection.getByRole("row").filter({ hasText: clinicAlphaName })).toBeVisible();

  // Now that the filtered data is confirmed loaded, clinicBeta must be absent.
  await expect(budgetSection.getByRole("row").filter({ hasText: clinicBetaName })).toHaveCount(0);
});

test("accounting user lands on payroll tab by default and cannot reach funding or clinic tabs", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const accounting = await provisionUser({ role: "accounting" });
  await signInAs(accounting);
  await page.goto(`/reports?year=${year}`);

  // accounting defaultSection = "payroll" → Payroll tab must be selected on load
  await expect(page.getByRole("tab", { name: "Payroll" })).toHaveAttribute("aria-selected", "true");

  // Funding & advances and Clinics tabs must not exist in the tab list
  await expect(page.getByRole("tab", { name: "Funding & advances" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Clinics" })).toHaveCount(0);

  // PaycheckLedger section must be visible as the active tab content
  await expect(
    page.getByRole("region", { name: "Paycheck reimbursement ledger" }),
  ).toBeVisible();
});

test("manager lands on team-funding tab by default and cannot reach payroll or clinic tabs", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-ManagerTabs-${unique()}`);
  const manager = await provisionUser({ role: "manager", clinicId });
  await signInAs(manager);
  await page.goto(`/reports?year=${year}`);

  // manager defaultSection = "funding" → "Team funding" tab must be selected on load
  await expect(page.getByRole("tab", { name: "Team funding" })).toHaveAttribute("aria-selected", "true");

  // Payroll and Clinics tabs must not exist in the tab list
  await expect(page.getByRole("tab", { name: "Payroll" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Clinics" })).toHaveCount(0);

  // Funding section must be visible as the active tab content
  await expect(
    page.getByRole("region", { name: "Employee budget usage" }),
  ).toBeVisible();
});

test("manager is redirected to team funding from restricted report URLs", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-ManagerRestrictedReports-${unique()}`);
  const manager = await provisionUser({ role: "manager", clinicId });
  await signInAs(manager);

  for (const restrictedSection of ["payroll", "clinics"]) {
    await page.goto(`/reports?year=${year}&section=${restrictedSection}`);

    await expect(page.getByRole("tab", { name: "Team funding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "Payroll" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Clinics" })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Employee budget usage" }),
    ).toBeVisible();
  }
});

test("prorated hire-year allocation generates the correct carry-forward debt", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  // Employee hired in July of the prior year.
  //   calcAnnualAllocationForYear(hireDate, year - 1):
  //     hireYear === year - 1  →  prorated
  //     hireMonth = 7
  //     allocation = (2000 * (13 - 7)) / 12 = 1000
  //
  // Prior-year reimbursed spend = $1,500  →  overage = $500
  //   carryoverDebt = max(0, $1,500 - $1,000) = $500
  //
  // Current-year allocation:
  //   calcAnnualAllocationForYear(hireDate, year): hireYear < year → full $2,000
  //   availableAllocation = max(0, $2,000 - $500) = $1,500
  //
  // Current-year awaiting_receipt, totalApproved = $300
  //   usedAmount     = $300
  //   remainingAmount = max(0, $1,500 - $300) = $1,200
  //   Future debt (carryoverDebt column) = $500

  const clinicId = await createClinic(`E2E-ProratedCarryover-${unique()}`);

  // insertUser supports hireDate directly in the helpers.
  const suffix = unique();
  const empId = await insertUser({
    clerkId: `prorated-carryover-${suffix}`,
    name: `Prorated Carryover Employee ${suffix}`,
    email: `prorated.carryover.${suffix}@example.test`,
    role: "employee",
    clinicId,
    hireDate: `${year - 1}-07-01`,
  });

  // Prior-year reimbursed request — exceeds the $1,000 prorated allocation by $500.
  // buildBudgetUsage resolves spend as: reimbursementAmount ?? totalApproved ?? totalRequested
  // Setting totalApproved=1500 on a "reimbursed" row is sufficient (no reimbursement row needed).
  await insertRequest({
    employeeId: empId,
    status: "reimbursed",
    courseNames: `Prior Year Prorated Over-Budget ${unique()}`,
    totalRequested: 1500,
    totalApproved: 1500,
    createdAt: new Date(`${year - 1}-09-15T12:00:00Z`),
  });

  // Current-year request — partially uses the reduced $1,500 available allocation.
  await insertRequest({
    employeeId: empId,
    status: "awaiting_receipt",
    courseNames: `Current Year Prorated Course ${unique()}`,
    totalRequested: 400,
    totalApproved: 300,
    createdAt: new Date(`${year}-03-01T12:00:00Z`),
  });

  const admin = await provisionUser({ role: "admin" });
  await signInAs(admin);
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}&section=funding`);

  const budgetSection = page.getByRole("region", { name: "Employee budget usage" });
  await expect(budgetSection).toBeVisible();

  const row = budgetSection.getByRole("row").filter({ hasText: "Prorated Carryover Employee" });

  // Available = full current-year allocation ($2,000) minus carry-forward debt ($500) = $1,500
  await expect(row.getByText("$1,500.00")).toBeVisible();
  // Used = current-year approved amount
  await expect(row.getByText("$300.00")).toBeVisible();
  // Remaining = available − used = $1,200
  await expect(row.getByText("$1,200.00")).toBeVisible();
  // Future debt column = carryoverDebt ($500) + advancedExposure ($0) = $500
  await expect(row.getByText("$500.00")).toBeVisible();
});
