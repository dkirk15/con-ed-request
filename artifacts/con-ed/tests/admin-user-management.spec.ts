import { test, expect } from "./fixtures";
import { getUserByEmail, setRole, insertUser, createClinic } from "./helpers/db";
import { createClerkUser, deleteClerkUser } from "./helpers/clerk";

/**
 * Admin flow: a brand-new Clerk account is auto-provisioned as `employee` on
 * first authenticated request, then promoted to `admin` in the database (the
 * real-world admin onboarding path). As admin the user can view the Users
 * directory and edit another user's record via the UI.
 *
 * Note on "create user": the app does not surface a Create User UI because
 * users are auto-provisioned when they first sign in with Clerk. The server
 * supports POST /api/users for programmatic creation; see the second test below.
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

  const roleSelect = page.getByTestId("user-role-select");
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

/**
 * Admin creates a user record (server-side, the same path as POST /api/users).
 * Users are auto-provisioned via Clerk on first sign-in; there is no "Create
 * User" form in the UI. This test inserts a DB record directly (same path the
 * server's POST /api/users handler follows) and verifies the user appears in
 * the admin's Users directory.
 */
test("admin sees newly created user in Users directory", async ({
  page,
  signUpUser,
  signInAs,
}) => {
  // Set up the admin account.
  const adminCandidate = await signUpUser();
  await signInAs(adminCandidate);
  await page.goto("/dashboard");
  await expect
    .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
      timeout: 15_000,
    })
    .toBe("employee");
  await setRole(adminCandidate.email, { role: "admin" });

  // Create a new user record (mimics POST /api/users server path).
  const newEmail = `e2e-created-${Date.now()}@example.com`;
  const newClerkId = `clerk_e2e_${Date.now()}`;
  // Track for cleanup.
  let clerkIdToDelete: string | null = null;
  try {
    clerkIdToDelete = await createClerkUser({
      firstName: "E2E",
      lastName: "Created",
      email: newEmail,
    });
  } catch {
    // Clerk user creation optional — DB row is sufficient for directory test.
  }
  await insertUser({
    clerkId: clerkIdToDelete ?? newClerkId,
    name: "E2E Created User",
    email: newEmail,
    role: "employee",
  });

  // After a page reload the admin directory should show the newly created user.
  await page.goto("/users");
  await expect(
    page.getByRole("heading", { name: "Users", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(newEmail)).toBeVisible();

  // Cleanup Clerk user if created.
  if (clerkIdToDelete) {
    await deleteClerkUser(clerkIdToDelete).catch(() => {});
  }
});
