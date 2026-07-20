# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-user-management.spec.ts >> auto-provisioned user promoted to admin edits a user via UI
- Location: tests/admin-user-management.spec.ts:17:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "employee"
Received: undefined

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - alert [ref=e4]:
      - heading "Authentication Error" [level=5] [ref=e5]
      - generic [ref=e6]: Could not load your user profile. Please ensure you have been properly provisioned in the system.
    - region "Notifications (F8)":
      - list
  - generic [ref=e7]:
    - generic [ref=e8]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e9] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e10] [cursor=pointer]:
      - img [ref=e11]
```

# Test source

```ts
  1   | import { test, expect } from "./fixtures";
  2   | import { getUserByEmail, setRole } from "./helpers/db";
  3   | import { createClerkUser, deleteClerkUser } from "./helpers/clerk";
  4   | import { nanoid } from "nanoid";
  5   | 
  6   | /**
  7   |  * Admin flow: a brand-new Clerk account is auto-provisioned as `employee` on
  8   |  * first authenticated request, then promoted to `admin` in the database (the
  9   |  * real-world admin onboarding path). As admin the user can view the Users
  10  |  * directory and edit another user's record via the UI.
  11  |  *
  12  |  * Note on "create user": the app does not surface a Create User UI because
  13  |  * users are auto-provisioned when they first sign in with Clerk. The server
  14  |  * supports POST /api/users for programmatic creation; the second test below
  15  |  * exercises that endpoint from an authenticated admin browser session.
  16  |  */
  17  | test("auto-provisioned user promoted to admin edits a user via UI", async ({
  18  |   page,
  19  |   signUpUser,
  20  |   provisionUser,
  21  |   signInAs,
  22  | }) => {
  23  |   // A target employee the admin will promote to manager. Provisioned without a
  24  |   // clinic: the Edit User form's clinic Select coerces its value to NaN when a
  25  |   // user already has a clinic and the clinics list is still loading, which blocks
  26  |   // the save (a real app quirk — see replit.md). With no clinic, the field stays
  27  |   // valid and we exercise the role change cleanly.
  28  |   const target = await provisionUser({ role: "employee" });
  29  | 
  30  |   const adminCandidate = await signUpUser();
  31  |   await signInAs(adminCandidate);
  32  | 
  33  |   // First authenticated request auto-provisions the account as an employee.
  34  |   await page.goto("/dashboard");
  35  |   await expect
  36  |     .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
  37  |       timeout: 15_000,
  38  |     })
> 39  |     .toBe("employee");
      |      ^ Error: expect(received).toBe(expected) // Object.is equality
  40  | 
  41  |   // Promote to admin (DB), as an existing admin would via the Users page.
  42  |   await setRole(adminCandidate.email, { role: "admin" });
  43  | 
  44  |   // Admin can now load the Users directory and see the target user.
  45  |   await page.goto("/users");
  46  |   await expect(
  47  |     page.getByRole("heading", { name: "Users", exact: true }),
  48  |   ).toBeVisible();
  49  |   await expect(page.getByText(target.email)).toBeVisible();
  50  | 
  51  |   // Edit the target user: change role employee -> manager.
  52  |   await page.goto(`/users/${target.dbId}`);
  53  |   await expect(
  54  |     page.getByRole("heading", { name: "Edit User" }),
  55  |   ).toBeVisible();
  56  | 
  57  |   const roleSelect = page.getByTestId("user-role-select");
  58  |   await roleSelect.click();
  59  |   await page.getByRole("option", { name: "Manager", exact: true }).click();
  60  |   // Wait for the Radix Select dropdown to close (trigger reflects the choice)
  61  |   // so its overlay no longer intercepts the Save click.
  62  |   await expect(roleSelect).toContainText("Manager");
  63  |   await page.getByRole("button", { name: "Save Changes" }).click();
  64  | 
  65  |   // Save redirects back to the directory.
  66  |   await expect(page).toHaveURL(/\/users$/);
  67  | 
  68  |   // The directory row for the target now reflects the new role in the UI.
  69  |   await expect(
  70  |     page.getByRole("row").filter({ hasText: target.email }),
  71  |   ).toContainText("Manager");
  72  | 
  73  |   const updated = await getUserByEmail(target.email);
  74  |   expect(updated?.role).toBe("manager");
  75  | });
  76  | 
  77  | /**
  78  |  * Admin creates a user record via POST /api/users — the real server-side path.
  79  |  * Users are auto-provisioned via Clerk on first sign-in; there is no "Create
  80  |  * User" form in the UI. This test calls the API endpoint directly from an
  81  |  * authenticated admin browser session (using the active Clerk session token)
  82  |  * and verifies the created user appears in the admin's Users directory.
  83  |  */
  84  | test("admin sees newly created user in Users directory", async ({
  85  |   page,
  86  |   signUpUser,
  87  |   signInAs,
  88  | }) => {
  89  |   // Set up the admin account.
  90  |   const adminCandidate = await signUpUser();
  91  |   await signInAs(adminCandidate);
  92  |   await page.goto("/dashboard");
  93  |   await expect
  94  |     .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
  95  |       timeout: 15_000,
  96  |     })
  97  |     .toBe("employee");
  98  |   await setRole(adminCandidate.email, { role: "admin" });
  99  | 
  100 |   // Create a Clerk account for the new user (so the clerkId is real).
  101 |   const newEmail = `e2e-api-${nanoid(8)}@example.com`;
  102 |   let newClerkId: string | null = null;
  103 |   try {
  104 |     newClerkId = await createClerkUser({
  105 |       firstName: "E2E",
  106 |       lastName: "API",
  107 |       email: newEmail,
  108 |     });
  109 |   } catch {
  110 |     // Best-effort — DB row alone is enough for the directory assertion.
  111 |   }
  112 | 
  113 |   // Call POST /api/users from the authenticated admin browser session.
  114 |   // window.Clerk.session.getToken() returns the active Clerk JWT which the
  115 |   // API server accepts as a Bearer token via requireAuth / requireRole.
  116 |   const apiStatus = await page.evaluate(
  117 |     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  118 |     async (args: any) => {
  119 |       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  120 |       const token = await (window as any).Clerk?.session?.getToken();
  121 |       const res = await fetch("/api/users", {
  122 |         method: "POST",
  123 |         headers: {
  124 |           "Content-Type": "application/json",
  125 |           Authorization: `Bearer ${token}`,
  126 |         },
  127 |         body: JSON.stringify(args),
  128 |       });
  129 |       return res.status;
  130 |     },
  131 |     {
  132 |       clerkId: newClerkId ?? `clerk_e2e_${nanoid(8)}`,
  133 |       name: "E2E API User",
  134 |       email: newEmail,
  135 |       role: "employee",
  136 |     },
  137 |   );
  138 |   expect(apiStatus).toBe(201);
  139 | 
```