import { test, expect } from "./fixtures";
import { getUserByEmail, setRole } from "./helpers/db";
import { createClerkUser, deleteClerkUser } from "./helpers/clerk";
import { nanoid } from "nanoid";

/**
 * Admin flow: a brand-new Clerk account is auto-provisioned as `employee` on
 * first authenticated request, then promoted to `admin` in the database (the
 * real-world admin onboarding path). As admin the user can view the Users
 * directory and edit another user's record via the UI.
 *
 * Note on "create user": the app does not surface a Create User UI because
 * users are auto-provisioned when they first sign in with Clerk. The server
 * supports POST /api/users for programmatic creation; the second test below
 * exercises that endpoint from an authenticated admin browser session.
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
    page.getByRole("heading", { name: "People", exact: true }),
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
 * Admin creates a user record via POST /api/users — the real server-side path.
 * Users are auto-provisioned via Clerk on first sign-in; there is no "Create
 * User" form in the UI. This test calls the API endpoint directly from an
 * authenticated admin browser session (using the active Clerk session token)
 * and verifies the created user appears in the admin's Users directory.
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

  // Create a Clerk account for the new user (so the clerkId is real).
  const newEmail = `e2e-api-${nanoid(8)}@example.com`;
  let newClerkId: string | null = null;
  try {
    newClerkId = await createClerkUser({
      firstName: "E2E",
      lastName: "API",
      email: newEmail,
    });
  } catch {
    // Best-effort — DB row alone is enough for the directory assertion.
  }

  // Call POST /api/users from the authenticated admin browser session.
  // window.Clerk.session.getToken() returns the active Clerk JWT which the
  // API server accepts as a Bearer token via requireAuth / requireRole.
  const apiStatus = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (window as any).Clerk?.session?.getToken();
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      });
      return res.status;
    },
    {
      clerkId: newClerkId ?? `clerk_e2e_${nanoid(8)}`,
      name: "E2E API User",
      email: newEmail,
      role: "employee",
    },
  );
  expect(apiStatus).toBe(201);

  // After a page navigation the admin directory should show the new user.
  await page.goto("/users");
  await expect(
    page.getByRole("heading", { name: "People", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(newEmail)).toBeVisible();

  // Cleanup Clerk user if created.
  if (newClerkId) {
    await deleteClerkUser(newClerkId).catch(() => {});
  }
});

test("returns a generic denial when Clerk user lookup fails", async ({
  page,
  signUpUser,
  signInAs,
}) => {
  const user = await signUpUser();
  await signInAs(user);

  // Keep the already-issued session token, then make the Clerk lookup fail.
  await deleteClerkUser(user.clerkId);
  const response = await page.evaluate(async () => {
    const token = await (window as any).Clerk?.session?.getToken();
    const result = await fetch("/api/dashboard/employee", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: result.status, body: await result.text() };
  });

  expect(response.status).toBe(403);
  expect(response.body).toBe(
    '{"error":"Unable to provision user. Contact your administrator."}',
  );
  expect(response.body).not.toContain(user.email);
  expect(response.body).not.toContain(user.clerkId);
});

test("returns an authorization denial for an unauthorized Clerk email", async ({
  page,
  signInAs,
}) => {
  const unauthorizedEmail = `e2e-unauthorized-${nanoid(8)}@example.com`;
  const clerkId = await createClerkUser({
    firstName: "E2E",
    lastName: "Unauthorized",
    email: unauthorizedEmail,
  });

  try {
    await signInAs({ email: unauthorizedEmail });
    const response = await page.evaluate(async () => {
      const token = await (window as any).Clerk?.session?.getToken();
      const result = await fetch("/api/dashboard/employee", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: result.status, body: await result.text() };
    });

    expect(response.status).toBe(403);
    expect(response.body).toBe(
      '{"error":"This account is not authorized for the CE portal. Contact an administrator."}',
    );
    expect(response.body).not.toContain(unauthorizedEmail);
    expect(response.body).not.toContain(clerkId);
  } finally {
    await deleteClerkUser(clerkId);
  }
});
