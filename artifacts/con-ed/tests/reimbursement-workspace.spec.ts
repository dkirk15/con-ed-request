import { expect, test } from "./fixtures";
import {
  createClinic,
  getReimbursement,
  getRequest,
  insertReceipt,
  insertRequest,
} from "./helpers/db";

test.describe("Reimbursement workspace", () => {
  test("Accounting records a reduced reimbursement, opens the next receipt, and releases unused CE funds", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const firstClinicId = await createClinic("E2E-Clinic-reimbursement-first");
    const secondClinicId = await createClinic("E2E-Clinic-reimbursement-second");
    const accounting = await provisionUser({ role: "accounting" });
    const firstEmployee = await provisionUser({
      role: "employee",
      clinicId: firstClinicId,
      hireDate: "2020-01-01",
    });
    const secondEmployee = await provisionUser({ role: "employee", clinicId: secondClinicId });

    const firstRequestId = await insertRequest({
      employeeId: firstEmployee.dbId,
      status: "receipt_submitted",
      courseNames: "E2E Reduced Reimbursement Course",
      tuition: 500,
      totalRequested: 500,
      approvedTuition: 500,
      totalApproved: 500,
      createdAt: new Date(Date.now() - 120_000),
    });
    await insertReceipt(firstRequestId, "reduced-reimbursement.pdf");

    const secondRequestId = await insertRequest({
      employeeId: secondEmployee.dbId,
      status: "receipt_submitted",
      courseNames: "E2E Next Reimbursement Course",
      tuition: 300,
      totalRequested: 300,
      approvedTuition: 300,
      totalApproved: 300,
      createdAt: new Date(Date.now() - 60_000),
    });
    await insertReceipt(secondRequestId, "next-reimbursement.pdf");

    await signInAs(accounting);
    await page.goto(`/reimbursements?selected=${firstRequestId}`);

    await expect(page.getByRole("heading", { name: "Reimbursement Queue" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Reduced Reimbursement Course" })).toBeVisible();
    await expect(page.getByText("reduced-reimbursement.pdf")).toBeVisible();

    await page.getByLabel("Actual amount").fill("400");
    await page.getByLabel("Paycheck date").fill("2026-07-31");
    await expect(page.getByText("$100.00 will be released")).toBeVisible();

    await page.getByRole("button", { name: "Record reimbursement and open next" }).click();
    await expect(page.getByText(/Record \$400\.00 reimbursement/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm reimbursement" }).click();

    await expect(page.getByRole("heading", { name: "E2E Next Reimbursement Course" })).toBeVisible();
    expect((await getRequest(firstRequestId))?.status).toBe("reimbursed");
    expect(Number((await getReimbursement(firstRequestId))?.amount)).toBe(400);

    await signInAs(firstEmployee);
    await page.goto("/dashboard");
    await expect(page.getByText(/\$1,600\.00 remaining/)).toBeVisible();
    await expect(page.getByText(/\$400\.00 used of \$2,000\.00/)).toBeVisible();
  });

  test("Accounting cannot reimburse more than the Business Office approved", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic("E2E-Clinic-reimbursement-cap");
    const accounting = await provisionUser({ role: "accounting" });
    const employee = await provisionUser({ role: "employee", clinicId });
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      status: "receipt_submitted",
      courseNames: "E2E Reimbursement Cap Course",
      tuition: 300,
      totalRequested: 300,
      approvedTuition: 300,
      totalApproved: 300,
    });
    await insertReceipt(requestId, "reimbursement-cap.pdf");

    await signInAs(accounting);
    await page.goto(`/reimbursements?selected=${requestId}`);

    await page.getByLabel("Actual amount").fill("350");
    await page.getByLabel("Paycheck date").fill("2026-07-31");
    await expect(page.getByText("Amount cannot exceed the $300.00 approval.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record reimbursement and open next" })).toBeDisabled();

    await page.waitForFunction(() => Boolean((window as any).Clerk?.session));
    const result = await page.evaluate(async (id) => {
      const token = await (window as any).Clerk?.session?.getToken();
      const response = await fetch(`/api/requests/${id}/reimburse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: 350, paycheckDate: "2026-07-31" }),
      });
      return { status: response.status, body: await response.json() };
    }, requestId);

    expect(result.status).toBe(400);
    expect(result.body.error).toContain("cannot exceed");
    expect((await getRequest(requestId))?.status).toBe("receipt_submitted");
  });

  test("Accounting queue includes only requests with submitted receipts", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic("E2E-Clinic-reimbursement-boundary");
    const accounting = await provisionUser({ role: "accounting" });
    const employee = await provisionUser({ role: "employee", clinicId });

    const readyId = await insertRequest({
      employeeId: employee.dbId,
      status: "receipt_submitted",
      courseNames: "E2E Ready for Accounting",
      tuition: 200,
      totalRequested: 200,
      approvedTuition: 200,
      totalApproved: 200,
    });
    await insertReceipt(readyId, "ready-for-accounting.pdf");
    await insertRequest({
      employeeId: employee.dbId,
      status: "awaiting_receipt",
      courseNames: "E2E Still Awaiting Receipt",
      tuition: 250,
      totalRequested: 250,
      approvedTuition: 250,
      totalApproved: 250,
    });

    await signInAs(accounting);
    await page.goto("/reimbursements");

    const queue = page.getByRole("list", { name: "Requests awaiting reimbursement" });
    await expect(queue.getByText("E2E Ready for Accounting")).toBeVisible();
    await expect(queue.getByText("E2E Still Awaiting Receipt")).toHaveCount(0);
  });
});
