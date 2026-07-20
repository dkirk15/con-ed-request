import { test, expect } from "./fixtures";
import { createClinic, insertRequest, getRequest } from "./helpers/db";
import type { RequestRow } from "./helpers/db";

function requestIdFromUrl(url: string): number {
  const match = url.match(/\/requests\/(\d+)/);
  if (!match) throw new Error(`No request id in URL: ${url}`);
  return Number(match[1]);
}

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
  await page.getByLabel("Course or event name *").fill("E2E Advanced Manual Therapy");
  await page.getByLabel("Tuition / registration ($)").fill("500");
  await page.getByRole("button", { name: "Submit for approval" }).click();

  await expect(page).toHaveURL(/\/requests\/\d+$/);
  await expect(page.getByText("Pending Manager Approval")).toBeVisible();

  const id = requestIdFromUrl(page.url());
  const row = await getRequest(id);
  expect(row?.status).toBe("pending_manager");
  expect(Number(row?.total_requested)).toBe(500);
  expect(row?.requires_repayment_guarantee).toBe(false);

  await page.goto("/requests");
  const requestRow = page
    .getByRole("row")
    .filter({ hasText: "E2E Advanced Manual Therapy" });
  await expect(requestRow).toBeVisible();
  await expect(requestRow.getByText("Pending Manager Approval")).toBeVisible();
});

test("employee reopens and submits a saved draft", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-draft`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "draft",
    courseNames: "E2E Draft Lifecycle Course",
    tuition: 350,
    totalRequested: 350,
  });

  await signInAs(employee);
  await page.goto(`/requests/${requestId}`);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continue editing" }).click();
  await expect(page).toHaveURL(new RegExp(`/requests/${requestId}/edit`));
  await page.getByRole("button", { name: "Submit for approval" }).click();

  await expect(page.getByText("Pending Manager Approval")).toBeVisible();
  expect((await getRequest(requestId))?.status).toBe("pending_manager");
});

test("employee edits and saves a draft before submitting", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-edit`);
  const manager = await provisionUser({ role: "manager", clinicId });
  const employee = await provisionUser({
    role: "employee",
    clinicId,
    managerId: manager.dbId,
  });
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    managerId: manager.dbId,
    status: "draft",
    courseNames: "E2E Draft Original Title",
    tuition: 200,
    totalRequested: 200,
  });

  await signInAs(employee);
  await page.goto(`/requests/${requestId}/edit`);
  await page.getByLabel("Course or event name *").fill("E2E Draft Edited Title");
  await page.getByLabel("Tuition / registration ($)").fill("300");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();

  const editedRow: RequestRow | undefined = await getRequest(requestId);
  expect(editedRow?.course_names).toBe("E2E Draft Edited Title");
  expect(Number(editedRow?.total_requested)).toBe(300);

  await page.reload();
  await expect(page.getByLabel("Course or event name *")).toHaveValue("E2E Draft Edited Title");
  await expect(page.getByLabel("Tuition / registration ($)")).toHaveValue("300");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Pending Manager Approval")).toBeVisible();
  expect((await getRequest(requestId))?.status).toBe("pending_manager");
});

test("employee deletes a saved draft", async ({ page, provisionUser, signInAs }) => {
  const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-delete-draft`);
  const employee = await provisionUser({ role: "employee", clinicId });
  const requestId = await insertRequest({
    employeeId: employee.dbId,
    status: "draft",
    courseNames: "E2E Draft To Delete",
    totalRequested: 125,
  });

  await signInAs(employee);
  await page.goto(`/requests/${requestId}/edit`);
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: "Delete draft" }).last().click();

  await expect(page).toHaveURL(/\/requests\?status=draft/);
  expect(await getRequest(requestId)).toBeUndefined();
});

test("employee is warned before leaving an unsaved draft", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const employee = await provisionUser({ role: "employee" });
  await signInAs(employee);
  await page.goto("/requests/new");
  await page.getByLabel("Course or event name *").fill("Unsaved E2E Course");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("unsaved changes");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Back to requests" }).click();
  await expect(page).toHaveURL(/\/requests\/new$/);
});
