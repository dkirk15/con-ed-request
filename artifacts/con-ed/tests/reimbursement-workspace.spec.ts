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
    // Both employees share one unique clinic so the clinicId filter scopes the
    // reimbursement queue to only this run's requests (avoids stale-data ordering).
    const ts = Date.now();
    const clinicId = await createClinic(`E2E-Clinic-reimbursement-${ts}`);
    const accounting = await provisionUser({ role: "accounting" });
    const firstEmployee = await provisionUser({
      role: "employee",
      clinicId,
      hireDate: "2020-01-01",
    });
    const secondEmployee = await provisionUser({ role: "employee", clinicId });
    const firstCourse = `E2E Reduced Reimbursement Course ${ts}`;
    const secondCourse = `E2E Next Reimbursement Course ${ts}`;

    const firstRequestId = await insertRequest({
      employeeId: firstEmployee.dbId,
      status: "receipt_submitted",
      courseNames: firstCourse,
      tuition: 500,
      totalRequested: 500,
      approvedTuition: 500,
      totalApproved: 500,
      createdAt: new Date(Date.now() - 600_000),
      updatedAt: new Date(Date.now() - 600_000),
    });
    await insertReceipt(firstRequestId, "reduced-reimbursement.pdf");

    const secondRequestId = await insertRequest({
      employeeId: secondEmployee.dbId,
      status: "receipt_submitted",
      courseNames: secondCourse,
      tuition: 300,
      totalRequested: 300,
      approvedTuition: 300,
      totalApproved: 300,
      createdAt: new Date(Date.now() - 300_000),
      updatedAt: new Date(Date.now() - 300_000),
    });
    await insertReceipt(secondRequestId, "next-reimbursement.pdf");

    await signInAs(accounting);
    // Use clinicId filter so the queue is scoped to this run's requests only.
    await page.goto(`/reimbursements?selected=${firstRequestId}&clinicId=${clinicId}`);

    await expect(page.getByRole("heading", { name: "Reimbursement Queue" })).toBeVisible();
    await expect(page.getByRole("heading", { name: firstCourse })).toBeVisible();
    await expect(page.getByText("reduced-reimbursement.pdf").first()).toBeVisible();

    await page.getByLabel("Actual amount").fill("400");
    await page.getByLabel("Paycheck date").fill("2026-07-31");
    await expect(page.getByText("$100.00 will be released")).toBeVisible();

    await page.getByRole("button", { name: "Record reimbursement and open next" }).click();
    await expect(page.getByText(/Record \$400\.00 reimbursement/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm reimbursement" }).click();

    await expect(page).toHaveURL(new RegExp(`selected=${secondRequestId}`));
    await expect(page.getByRole("heading", { name: secondCourse })).toBeVisible();
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
    const clinicId = await createClinic(`E2E-Clinic-reimbursement-cap-${Date.now()}`);
    const accounting = await provisionUser({ role: "accounting" });
    const employee = await provisionUser({ role: "employee", clinicId });
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      status: "receipt_submitted",
      courseNames: `E2E Reimbursement Cap Course ${Date.now()}`,
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
    const ts = Date.now();
    const clinicId = await createClinic(`E2E-Clinic-reimbursement-boundary-${ts}`);
    const accounting = await provisionUser({ role: "accounting" });
    const employee = await provisionUser({ role: "employee", clinicId });
    const readyCourse = `E2E Ready for Accounting ${ts}`;
    const awaitingCourse = `E2E Still Awaiting Receipt ${ts}`;

    const readyId = await insertRequest({
      employeeId: employee.dbId,
      status: "receipt_submitted",
      courseNames: readyCourse,
      tuition: 200,
      totalRequested: 200,
      approvedTuition: 200,
      totalApproved: 200,
    });
    await insertReceipt(readyId, "ready-for-accounting.pdf");
    await insertRequest({
      employeeId: employee.dbId,
      status: "awaiting_receipt",
      courseNames: awaitingCourse,
      tuition: 250,
      totalRequested: 250,
      approvedTuition: 250,
      totalApproved: 250,
    });

    await signInAs(accounting);
    // Filter by clinic so only this run's request appears in the queue.
    await page.goto(`/reimbursements?clinicId=${clinicId}`);

    const queue = page.getByRole("list", { name: "Requests awaiting reimbursement" });
    await expect(queue.getByText(readyCourse)).toBeVisible();
    await expect(queue.getByText(awaitingCourse)).toHaveCount(0);
  });
});
