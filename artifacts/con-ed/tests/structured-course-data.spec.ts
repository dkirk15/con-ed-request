import { test, expect } from "./fixtures";
import { createClinic, getRequest, insertRequest } from "./helpers/db";

test.describe("Structured course data", () => {
  test("requires complete course details and validates physical course dates and location", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic("E2E-Clinic-structured-course");
    const manager = await provisionUser({ role: "manager", clinicId });
    const employee = await provisionUser({ role: "employee", clinicId, managerId: manager.dbId });

    await signInAs(employee);
    await page.goto("/requests/new");
    await page.getByLabel("Course or event name *").fill("E2E Structured Course");
    await page.getByLabel("Tuition / registration ($)").fill("450");
    await page.getByRole("button", { name: "Submit for approval" }).click();

    await expect(page.getByText("Complete the course details")).toBeVisible();
    await expect(page.getByText("Enter the course provider")).toBeVisible();
    await expect(page.getByText("Select the course start date")).toBeVisible();

    await page.getByLabel("Course provider *").fill("E2E Learning Institute");
    await page.getByLabel("Course webpage").fill("https://example.com/structured-course");
    await page.getByLabel("Start date *").fill("2026-12-10");
    await page.getByLabel("End date *").fill("2026-12-09");
    await page.getByLabel("Delivery method *").click();
    await page.getByRole("option", { name: "In person", exact: true }).click();
    await page.getByRole("button", { name: "Submit for approval" }).click();

    await expect(page.getByText("End date cannot be before the start date")).toBeVisible();
    await expect(page.getByText("Enter the course location")).toBeVisible();

    await page.getByLabel("End date *").fill("2026-12-11");
    await page.getByLabel("Course location *").fill("Tacoma Convention Center");
    await page.getByRole("button", { name: "Submit for approval" }).click();

    await expect(page).toHaveURL(/\/requests\/\d+$/);
    await expect(page.getByText("Pending Manager Approval")).toBeVisible();
    const requestId = Number(page.url().match(/\/requests\/(\d+)/)?.[1]);
    const request = await getRequest(requestId);
    expect(request?.course_provider).toBe("E2E Learning Institute");
    expect(request?.delivery_method).toBe("in_person");
    expect(request?.location).toBe("Tacoma Convention Center");
  });

  test("keeps legacy dates readable while the API blocks incomplete draft submission", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const employee = await provisionUser({ role: "employee" });
    const requestId = await insertRequest({
      employeeId: employee.dbId,
      status: "draft",
      courseNames: "E2E Legacy Course",
      courseDates: "March 4-5, 2026",
      totalRequested: 100,
    });

    await signInAs(employee);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("March 4-5, 2026")).toBeVisible();

    const response = await page.evaluate(async (id) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (window as any).Clerk?.session?.getToken();
      const result = await fetch(`/api/requests/${id}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: result.status, body: await result.json() };
    }, requestId);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("provider");
    expect((await getRequest(requestId))?.status).toBe("draft");
  });
});
