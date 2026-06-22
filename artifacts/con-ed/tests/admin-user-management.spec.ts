import { test, expect } from "./fixtures";
import { getUserByEmail, setRole } from "./helpers/db";

/**
 * Admin flow: a brand-new Clerk account is auto-provisioned as `employee` on
 * first authenticated request, then promoted to `admin` in the database (the
 * real-world admin onboarding path). As admin the user can view the Users
 * directory and edit another user's record via the UI.
 */
test("auto-provisioned user promoted to admin edits a user via UI", async ({
  page,
  signUpUser,
  provisionUser,
  signInAs,
}) => {
  // A target employee the admin will promote to manager. Provisioned without a
  // clinic: the Edit User form's clinic Select coerces its value to NaN when a
  // user already has a clinic and the clinics list is still loading, which blocks
  // the save (a real app quirk — see replit.md). With no clinic, the field stays
  // valid and we exercise the role change cleanly.
  const target = await provisionUser({ role: "employee" });

  const adminCandidate = await signUpUser();
  await signInAs(adminCandidate);

  // First authenticated request auto-provisions the account as an employee.
  await page.goto("/dashboard");
  await expect
    .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
      timeout: 15_000,
    })
    .toBe("employee");

  // Promote to admin (DB), as an existing admin would via the Users page.
  await setRole(adminCandidate.email, { role: "admin" });

  // Admin can now load the Users directory and see the target user.
  await page.goto("/users");
  await expect(
    page.getByRole("heading", { name: "Users", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(target.email)).toBeVisible();

  // Edit the target user: change role employee -> manager.
  await page.goto(`/users/${target.dbId}`);
  await expect(
    page.getByRole("heading", { name: "Edit User" }),
  ).toBeVisible();

  const roleSelect = page.getByRole("combobox").first();
  await roleSelect.click();
  await page.getByRole("option", { name: "Manager", exact: true }).click();
  // Wait for the Radix Select dropdown to close (trigger reflects the choice)
  // so its overlay no longer intercepts the Save click.
  await expect(roleSelect).toContainText("Manager");
  await page.getByRole("button", { name: "Save Changes" }).click();

  // Save redirects back to the directory.
  await expect(page).toHaveURL(/\/users$/);

  // The directory row for the target now reflects the new role in the UI.
  await expect(
    page.getByRole("row").filter({ hasText: target.email }),
  ).toContainText("Manager");

  const updated = await getUserByEmail(target.email);
  expect(updated?.role).toBe("manager");
});
