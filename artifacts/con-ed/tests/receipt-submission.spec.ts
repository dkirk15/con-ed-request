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
  const clinicId = await createClinic(`E2E-Clinic-receipt`);
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
  const receiptNextStep = page.getByRole("region", { name: "Ready for your receipt" });
  await expect(receiptNextStep).toBeVisible();
  await expect(
    receiptNextStep.getByText(
      "Your course is approved. After making the purchase, upload the itemized receipt to begin reimbursement.",
    ),
  ).toBeVisible();
  await expect(receiptNextStep.getByRole("button", { name: "Upload receipt" })).toBeVisible();

  const pdfBuffer = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n" +
      "trailer\n<< /Root 1 0 R >>\n%%EOF",
    "utf8",
  );
  await page.locator("#receipt-upload").setInputFiles({
    name: "e2e-receipt.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });

  // File is staged but not yet submitted — click the explicit Submit button.
  await receiptNextStep.getByRole("button", { name: "Submit receipt" }).click();

  await expect(
    page.getByRole("heading", { name: /Request #\d+/ }).getByText("Receipt Submitted"),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Receipt submitted" })).toBeVisible();

  const row = await getRequest(requestId);
  expect(row?.status).toBe("receipt_submitted");

  const receiptRows = await query(
    "SELECT * FROM receipts WHERE request_id = $1",
    [requestId],
  );
  expect(receiptRows.length).toBe(1);

  const receiptUrl = String(receiptRows[0].file_url);
  const receiptHeaders = await page.evaluate(async (fileUrl) => {
    const token = await (window as any).Clerk?.session?.getToken();
    const load = (suffix = "") =>
      fetch(`/api/storage${fileUrl}${suffix}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    const inlineResponse = await load("?disposition=inline");
    const downloadResponse = await load();
    return {
      inlineStatus: inlineResponse.status,
      inlineType: inlineResponse.headers.get("content-type"),
      inlineDisposition: inlineResponse.headers.get("content-disposition"),
      downloadDisposition: downloadResponse.headers.get("content-disposition"),
    };
  }, receiptUrl);
  expect(receiptHeaders).toMatchObject({
    inlineStatus: 200,
    inlineType: "application/pdf",
  });
  expect(receiptHeaders.inlineDisposition).toMatch(/^inline;/);
  expect(receiptHeaders.downloadDisposition).toMatch(/^attachment;/);

  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.getByRole("dialog", { name: "Receipt preview" })).toBeVisible();
  await expect(
    page.getByTitle("Receipt preview: e2e-receipt.pdf"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open in new tab" })).toBeEnabled();
  await expect(
    page.getByRole("dialog", { name: "Receipt preview" }).getByRole("button", { name: "Download" }),
  ).toBeEnabled();
});

test("receipt upload URLs reject unsafe files and requests owned by someone else", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-receipt-security`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });
  const otherEmployee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "awaiting_receipt",
    courseNames: "E2E Safe Receipt Course",
    tuition: 100,
    totalRequested: 100,
    approvedTuition: 100,
    totalApproved: 100,
  });
  const otherRequestId = await insertRequest({
    employeeId: otherEmployee.dbId,
    managerId: manager.dbId,
    status: "awaiting_receipt",
    courseNames: "E2E Other Receipt Course",
    tuition: 100,
    totalRequested: 100,
    approvedTuition: 100,
    totalApproved: 100,
  });

  await signInAs(employee);
  await page.goto(`/requests/${requestId}`);
  await page.waitForFunction(() =>
    Boolean((window as any).Clerk?.session),
  );

  const statuses = await page.evaluate(
    async ({ ownId, otherId }) => {
      const token = await (window as any).Clerk?.session?.getToken();
      const requestUpload = (body: object) =>
        fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

      const unsafe = await requestUpload({
        requestId: ownId,
        name: "receipt.svg",
        size: 100,
        contentType: "image/svg+xml",
      });
      const wrongOwner = await requestUpload({
        requestId: otherId,
        name: "receipt.png",
        size: 100,
        contentType: "image/png",
      });
      const signed = await requestUpload({
        requestId: ownId,
        name: "spoofed.png",
        size: 12,
        contentType: "image/png",
      });
      const { uploadURL, objectPath } = await signed.json();
      await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: "not an image",
      });
      const spoofedContent = await fetch(`/api/requests/${ownId}/receipts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileUrl: objectPath, fileName: "spoofed.png" }),
      });
      return [unsafe.status, wrongOwner.status, spoofedContent.status];
    },
    { ownId: requestId, otherId: otherRequestId },
  );

  expect(statuses).toEqual([400, 403, 400]);
});
