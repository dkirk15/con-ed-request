# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accounting-reimbursement.spec.ts >> accounting marks a request reimbursed -> reimbursed
- Location: tests/accounting-reimbursement.spec.ts:9:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Ready for Reimbursement')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByText('Ready for Reimbursement')

```

```yaml
- alert:
  - heading "Authentication Error" [level=5]
  - text: Could not load your user profile. Please ensure you have been properly provisioned in the system.
- region "Notifications (F8)":
  - list
- text: This is a temporary development preview, and these links are not for public use.
- link "Publish your app":
  - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
- text: for secure sharing or use an invite link.
- button "Close banner":
  - img
```

# Test source

```ts
  1  | import { test, expect } from "./fixtures";
  2  | import { createClinic, insertRequest, getRequest } from "./helpers/db";
  3  | 
  4  | /**
  5  |  * Accounting processes requests that have a submitted receipt. The dashboard
  6  |  * shows the queue; marking a request reimbursed (with a paycheck date) moves
  7  |  * it to `reimbursed`.
  8  |  */
  9  | test("accounting marks a request reimbursed -> reimbursed", async ({
  10 |   page,
  11 |   provisionUser,
  12 |   signInAs,
  13 | }) => {
  14 |   const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-acct`);
  15 |   const accounting = await provisionUser({ role: "accounting" });
  16 |   const employee = await provisionUser({ role: "employee", clinicId });
  17 |   const requestId = await insertRequest({
  18 |     employeeId: employee.dbId,
  19 |     status: "receipt_submitted",
  20 |     courseNames: "E2E Reimbursement Course",
  21 |     tuition: 300,
  22 |     totalRequested: 300,
  23 |     approvedTuition: 300,
  24 |     totalApproved: 300,
  25 |   });
  26 | 
  27 |   await signInAs(accounting);
  28 | 
  29 |   // Accounting dashboard shows the request in the "Ready for Reimbursement" queue.
  30 |   // CardTitle renders as a <div>, not a heading element, so use getByText.
  31 |   await page.goto("/dashboard");
> 32 |   await expect(page.getByText("Ready for Reimbursement")).toBeVisible();
     |                                                           ^ Error: expect(locator).toBeVisible() failed
  33 |   // The accounting queue card lists the course name of the seeded request.
  34 |   await expect(page.getByText("E2E Reimbursement Course")).toBeVisible();
  35 | 
  36 |   await page.goto(`/requests/${requestId}`);
  37 | 
  38 |   await page.getByRole("button", { name: "Mark Reimbursed" }).click();
  39 |   await page.locator('input[type="date"]').fill("2026-06-30");
  40 |   await page.getByRole("button", { name: "Confirm Reimbursement" }).click();
  41 | 
  42 |   await expect(
  43 |     page.getByRole("heading", { name: /Request #\d+/ }).getByText("Reimbursed"),
  44 |   ).toBeVisible();
  45 | 
  46 |   const row = await getRequest(requestId);
  47 |   expect(row?.status).toBe("reimbursed");
  48 | });
  49 | 
```