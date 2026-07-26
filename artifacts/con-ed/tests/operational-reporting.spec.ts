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
  await page.goto(`/reports?year=${year}&clinicId=${clinicId}`);

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
