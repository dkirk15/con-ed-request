import { test, expect } from "./fixtures";

test("employee can sign in programmatically and reach the dashboard", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const user = await provisionUser({ role: "employee" });

  await signInAs(user);

  // Full-page navigation must keep the session (the rest of the suite relies on
  // page.goto between routes).
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Overview" }),
  ).toBeVisible();
  await expect(page.getByText(`Welcome back, ${user.name}`)).toBeVisible();

  // A second full reload to a different protected route, to be sure the session
  // is durable across reloads, not just the first navigation.
  await page.goto("/requests");
  await expect(page).toHaveURL(/\/requests/);
  await expect(
    page.getByRole("heading", { name: "Requests" }),
  ).toBeVisible();
});
