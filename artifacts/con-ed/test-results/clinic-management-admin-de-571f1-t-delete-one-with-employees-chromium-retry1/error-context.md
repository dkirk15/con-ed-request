# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: clinic-management.spec.ts >> admin deletes an empty clinic but cannot delete one with employees
- Location: tests/clinic-management.spec.ts:96:1

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
  23  | 
  24  |   // First authenticated request auto-provisions the account as an employee.
  25  |   await page.goto("/dashboard");
  26  |   await expect
  27  |     .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
  28  |       timeout: 15_000,
  29  |     })
  30  |     .toBe("employee");
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
> 123 |     .toBe("employee");
      |      ^ Error: expect(received).toBe(expected) // Object.is equality
  124 |   await setRole(adminCandidate.email, { role: "admin" });
  125 | 
  126 |   try {
  127 |     await page.goto("/clinics");
  128 |     await expect(
  129 |       page.getByRole("heading", { name: "Clinics", exact: true }),
  130 |     ).toBeVisible();
  131 | 
  132 |     // Delete the empty clinic: open its confirmation dialog and confirm.
  133 |     await page.getByRole("button", { name: `Delete ${emptyClinicName}` }).click();
  134 |     await expect(
  135 |       page.getByRole("alertdialog").getByText(`Delete ${emptyClinicName}?`),
  136 |     ).toBeVisible();
  137 |     await page.getByRole("button", { name: "Delete Clinic" }).click();
  138 | 
  139 |     // The row is gone from the UI and the database.
  140 |     await expect(
  141 |       page.getByRole("row").filter({ hasText: emptyClinicName }),
  142 |     ).toHaveCount(0);
  143 |     await expect
  144 |       .poll(async () =>
  145 |         (await query("SELECT id FROM clinics WHERE id = $1", [emptyClinicId]))
  146 |           .length,
  147 |       )
  148 |       .toBe(0);
  149 | 
  150 |     // Attempt to delete the clinic that still has an employee -> 409 toast.
  151 |     await page.getByRole("button", { name: `Delete ${usedClinicName}` }).click();
  152 |     await page.getByRole("button", { name: "Delete Clinic" }).click();
  153 |     await expect(
  154 |       page.getByText(
  155 |         "This clinic still has employees assigned to it. Reassign those employees first.",
  156 |         { exact: true },
  157 |       ),
  158 |     ).toBeVisible();
  159 | 
  160 |     // The clinic row still exists in the UI and the database.
  161 |     await expect(
  162 |       page.getByRole("row").filter({ hasText: usedClinicName }),
  163 |     ).toBeVisible();
  164 |     const count = (
  165 |       await query("SELECT id FROM clinics WHERE id = $1", [usedClinicId])
  166 |     ).length;
  167 |     expect(count).toBe(1);
  168 | 
  169 |     // A malformed ID with a numeric prefix (e.g. "<id>abc") must be rejected
  170 |     // with 400 and must NOT delete the clinic its prefix matches. Guards
  171 |     // against lenient parsing silently deleting clinic <id>.
  172 |     await page.waitForFunction(() =>
  173 |       Boolean(
  174 |         (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
  175 |       ),
  176 |     );
  177 |     const malformedStatus = await page.evaluate(async (gid) => {
  178 |       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  179 |       const token = await (window as any).Clerk?.session?.getToken();
  180 |       const res = await fetch(`/api/clinics/${gid}abc`, {
  181 |         method: "DELETE",
  182 |         headers: { Authorization: `Bearer ${token}` },
  183 |       });
  184 |       return res.status;
  185 |     }, guardClinicId);
  186 |     expect(malformedStatus).toBe(400);
  187 |     expect(
  188 |       (await query("SELECT id FROM clinics WHERE id = $1", [guardClinicId]))
  189 |         .length,
  190 |     ).toBe(1);
  191 |   } finally {
  192 |     // Cleanup: remove the employee first (FK), then both clinics.
  193 |     await query("DELETE FROM users WHERE id = $1", [employee.dbId]);
  194 |     await query("DELETE FROM clinics WHERE id = ANY($1)", [
  195 |       [emptyClinicId, usedClinicId, guardClinicId],
  196 |     ]);
  197 |   }
  198 | });
  199 | 
  200 | /**
  201 |  * Authorization boundary: clinic creation is admin-only. A non-admin
  202 |  * (manager) calling POST /api/clinics from an authenticated browser session
  203 |  * with their active Clerk token is rejected with 403, and no row is created.
  204 |  */
  205 | test("non-admin cannot create a clinic via the API", async ({
  206 |   page,
  207 |   provisionUser,
  208 |   signInAs,
  209 | }) => {
  210 |   const name = `E2E Clinic Forbidden ${nanoid(6)}`;
  211 | 
  212 |   const manager = await provisionUser({ role: "manager" });
  213 |   await signInAs(manager);
  214 |   await page.goto("/dashboard");
  215 | 
  216 |   // After navigation Clerk re-initialises; wait until the session (and thus a
  217 |   // usable token) is available before exercising the authenticated endpoint.
  218 |   await page.waitForFunction(() =>
  219 |     Boolean(
  220 |       (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
  221 |     ),
  222 |   );
  223 | 
```