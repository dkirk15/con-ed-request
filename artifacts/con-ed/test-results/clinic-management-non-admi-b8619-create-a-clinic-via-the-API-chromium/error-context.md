# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: clinic-management.spec.ts >> non-admin cannot create a clinic via the API
- Location: tests/clinic-management.spec.ts:205:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 403
Received: 502
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - status "Loading" [ref=e4]
    - region "Notifications (F8)":
      - list
  - generic [ref=e6]:
    - generic [ref=e7]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e8] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e9] [cursor=pointer]:
      - img [ref=e10]
```

# Test source

```ts
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
  224 |   const status = await page.evaluate(async (clinicName) => {
  225 |     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  226 |     const token = await (window as any).Clerk?.session?.getToken();
  227 |     const res = await fetch("/api/clinics", {
  228 |       method: "POST",
  229 |       headers: {
  230 |         "Content-Type": "application/json",
  231 |         Authorization: `Bearer ${token}`,
  232 |       },
  233 |       body: JSON.stringify({ name: clinicName }),
  234 |     });
  235 |     return res.status;
  236 |   }, name);
  237 | 
> 238 |   expect(status).toBe(403);
      |                  ^ Error: expect(received).toBe(expected) // Object.is equality
  239 | 
  240 |   // Ensure nothing was inserted.
  241 |   const count = (await query("SELECT id FROM clinics WHERE name = $1", [name]))
  242 |     .length;
  243 |   expect(count).toBe(0);
  244 | });
  245 | 
```