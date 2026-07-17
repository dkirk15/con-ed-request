import { test, expect } from "./fixtures";
import { createClinic } from "./helpers/db";

/**
 * Each of the five roles lands on its own dashboard variant and sees a
 * navigation surface scoped to its permissions:
 *  - Role-specific navigation exposes only the workspaces each role needs.
 *  - "New Request" is available only to employee and manager.
 */
test.describe("Role-based dashboards and navigation", () => {
  test("employee: allocation dashboard, can create requests, no Users nav", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-emp`);
    const user = await provisionUser({ role: "employee", clinicId });
    await signInAs(user);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText(`Welcome back, ${user.name}`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);

    await page.goto("/requests");
    await expect(page.getByRole("button", { name: "New Request" })).toBeVisible();
  });

  test("manager: approval dashboard, Users nav, can create requests", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-mgr`);
    const user = await provisionUser({ role: "manager", clinicId });
    await signInAs(user);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Action Required")).toBeVisible();
    await expect(page.getByText("My Annual Allocation")).toBeVisible();
    await expect(page.getByRole("link", { name: "Team" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Approvals" })).toBeVisible();

    await page.goto("/requests");
    await expect(page.getByRole("button", { name: "New Request" })).toBeVisible();
  });

  test("business_office: BO approval dashboard, no Users nav, no New Request", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const user = await provisionUser({ role: "business_office" });
    await signInAs(user);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(
      page.getByText("Awaiting Business Office Approval"),
    ).toBeVisible();
    await expect(page.getByText("Total Funding Approved YTD")).toBeVisible();
    await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "CE Approvals" })).toBeVisible();

    await page.goto("/requests");
    await expect(
      page.getByRole("button", { name: "New Request" }),
    ).toHaveCount(0);
  });

  test("accounting: reimbursement dashboard, no Users nav, no New Request", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const user = await provisionUser({ role: "accounting" });
    await signInAs(user);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Ready for Reimbursement")).toBeVisible();
    await expect(
      page.getByText("Pending Reimbursement Processing"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Reimbursements" })).toBeVisible();

    await page.goto("/requests");
    await expect(
      page.getByRole("button", { name: "New Request" }),
    ).toHaveCount(0);
  });

  test("admin: reaches dashboard, has Users nav, no New Request", async ({
    page,
    provisionUser,
    signInAs,
  }) => {
    const user = await provisionUser({ role: "admin" });
    await signInAs(user);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    await expect(page.getByRole("link", { name: "People" })).toBeVisible();

    await page.goto("/requests");
    await expect(
      page.getByRole("button", { name: "New Request" }),
    ).toHaveCount(0);
  });
});
