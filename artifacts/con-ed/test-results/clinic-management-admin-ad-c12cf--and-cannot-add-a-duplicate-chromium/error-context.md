# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: clinic-management.spec.ts >> admin adds a new clinic via the UI and cannot add a duplicate
- Location: tests/clinic-management.spec.ts:14:1

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
  2   | import { createClinic, getUserByEmail, setRole, query } from "./helpers/db";
  3   | import { nanoid } from "nanoid";
  4   | 
  5   | /**
  6   |  * Admin clinic management: an admin can add a new clinic to the clinic list via
  7   |  * the UI (POST /api/clinics, admin-gated). Duplicate names are rejected
  8   |  * case-insensitively with a 409 surfaced as an error toast.
  9   |  *
  10  |  * Admins are onboarded the real-world way: a brand-new Clerk account is
  11  |  * auto-provisioned as `employee` on first authenticated request, then promoted
  12  |  * to `admin` in the database.
  13  |  */
  14  | test("admin adds a new clinic via the UI and cannot add a duplicate", async ({
  15  |   page,
  16  |   signUpUser,
  17  |   signInAs,
  18  | }) => {
  19  |   const clinicName = `E2E Clinic ${nanoid(6)}`;
  20  | 
  21  |   const adminCandidate = await signUpUser();
  22  |   await signInAs(adminCandidate);
  23  | 
  24  |   // First authenticated request auto-provisions the account as an employee.
  25  |   await page.goto("/dashboard");
  26  |   await expect
  27  |     .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
  28  |       timeout: 15_000,
  29  |     })
> 30  |     .toBe("employee");
      |      ^ Error: expect(received).toBe(expected) // Object.is equality
  31  | 
  32  |   // Promote to admin (DB), as an existing admin would.
  33  |   await setRole(adminCandidate.email, { role: "admin" });
  34  | 
  35  |   try {
  36  |     // Admin opens the Clinics page.
  37  |     await page.goto("/clinics");
  38  |     await expect(
  39  |       page.getByRole("heading", { name: "Clinics", exact: true }),
  40  |     ).toBeVisible();
  41  | 
  42  |     // Add a new clinic via the dialog.
  43  |     await page.getByRole("button", { name: "Add Clinic" }).click();
  44  |     await page.getByLabel("Clinic name").fill(clinicName);
  45  |     await page
  46  |       .getByRole("dialog")
  47  |       .getByRole("button", { name: "Add Clinic" })
  48  |       .click();
  49  | 
  50  |     // The new clinic appears in the directory table.
  51  |     await expect(
  52  |       page.getByRole("row").filter({ hasText: clinicName }),
  53  |     ).toBeVisible();
  54  | 
  55  |     // And it is persisted in the database (exactly one row).
  56  |     await expect
  57  |       .poll(async () =>
  58  |         (await query("SELECT id FROM clinics WHERE name = $1", [clinicName]))
  59  |           .length,
  60  |       )
  61  |       .toBe(1);
  62  | 
  63  |     // Adding the same name again (different case) is rejected with a 409 toast.
  64  |     await page.getByRole("button", { name: "Add Clinic" }).click();
  65  |     await page.getByLabel("Clinic name").fill(clinicName.toUpperCase());
  66  |     await page
  67  |       .getByRole("dialog")
  68  |       .getByRole("button", { name: "Add Clinic" })
  69  |       .click();
  70  | 
  71  |     await expect(
  72  |       page.getByText("A clinic with this name already exists.", { exact: true }),
  73  |     ).toBeVisible();
  74  | 
  75  |     // No duplicate row was created.
  76  |     const count = (
  77  |       await query("SELECT id FROM clinics WHERE lower(name) = lower($1)", [
  78  |         clinicName,
  79  |       ])
  80  |     ).length;
  81  |     expect(count).toBe(1);
  82  |   } finally {
  83  |     // Cleanup any clinic row(s) created by this test.
  84  |     await query("DELETE FROM clinics WHERE lower(name) = lower($1)", [
  85  |       clinicName,
  86  |     ]);
  87  |   }
  88  | });
  89  | 
  90  | /**
  91  |  * Admin deletes a clinic via the UI: opens the confirmation dialog, confirms,
  92  |  * and the row disappears from the directory and the database. A clinic that
  93  |  * still has an employee assigned cannot be deleted (FK guard -> 409 toast,
  94  |  * row preserved).
  95  |  */
  96  | test("admin deletes an empty clinic but cannot delete one with employees", async ({
  97  |   page,
  98  |   provisionUser,
  99  |   signUpUser,
  100 |   signInAs,
  101 | }) => {
  102 |   const emptyClinicName = `E2E Delete Empty ${nanoid(6)}`;
  103 |   const usedClinicName = `E2E Delete Used ${nanoid(6)}`;
  104 |   const guardClinicName = `E2E Delete Guard ${nanoid(6)}`;
  105 | 
  106 |   const emptyClinicId = await createClinic(emptyClinicName);
  107 |   const usedClinicId = await createClinic(usedClinicName);
  108 |   const guardClinicId = await createClinic(guardClinicName);
  109 | 
  110 |   // An employee occupies the "used" clinic so its delete is blocked by the FK.
  111 |   const employee = await provisionUser({
  112 |     role: "employee",
  113 |     clinicId: usedClinicId,
  114 |   });
  115 | 
  116 |   const adminCandidate = await signUpUser();
  117 |   await signInAs(adminCandidate);
  118 |   await page.goto("/dashboard");
  119 |   await expect
  120 |     .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
  121 |       timeout: 15_000,
  122 |     })
  123 |     .toBe("employee");
  124 |   await setRole(adminCandidate.email, { role: "admin" });
  125 | 
  126 |   try {
  127 |     await page.goto("/clinics");
  128 |     await expect(
  129 |       page.getByRole("heading", { name: "Clinics", exact: true }),
  130 |     ).toBeVisible();
```