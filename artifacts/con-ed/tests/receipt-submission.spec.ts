import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest, query } from "./helpers/db";

/**
 * An employee whose request was approved by the Business Office (status
 * `awaiting_receipt`) uploads a receipt. This exercises the real upload flow
 * (presigned URL -> object storage PUT -> POST receipt) and verifies the
 * request transitions to `receipt_submitted` in the UI and the database, and
 * that a receipts row is persisted.
 */
test("employee uploads a receipt -> receipt_submitted", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-receipt`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "awaiting_receipt",
    courseNames: "E2E Receipt Course",
    tuition: 250,
    totalRequested: 250,
    approvedTuition: 250,
    totalApproved: 250,
  });

  await signInAs(employee);
  await page.goto(`/requests/${requestId}`);

  await expect(
    page.getByRole("heading", { name: /Request #\d+/ }).getByText("Awaiting Receipt"),
  ).toBeVisible();

  const pngBuffer = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c63f8cfc0f01f0005000100ff0fd70a" +
      "000000049454e44ae426082",
    "hex",
  );
  await page.locator("#receipt-upload").setInputFiles({
    name: "e2e-receipt.png",
    mimeType: "image/png",
    buffer: pngBuffer,
  });

  await expect(
    page.getByRole("heading", { name: /Request #\d+/ }).getByText("Receipt Submitted"),
  ).toBeVisible();

  const row = await getRequest(requestId);
  expect(row?.status).toBe("receipt_submitted");

  const receiptRows = await query(
    "SELECT * FROM receipts WHERE request_id = $1",
    [requestId],
  );
  expect(receiptRows.length).toBe(1);
});
