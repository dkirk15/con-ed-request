# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: carry-forward-debt.spec.ts >> prior-year overspend shows as carry-forward debt
- Location: tests/carry-forward-debt.spec.ts:13:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByText('Available budget:').locator('xpath=following-sibling::span[1]')
Expected: "$1,000.00"
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" with timeout 20000ms
  - waiting for getByText('Available budget:').locator('xpath=following-sibling::span[1]')

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
  2  | import { createClinic, insertRequest } from "./helpers/db";
  3  | 
  4  | /**
  5  |  * Prior-year approved spend that exceeds the annual allocation carries forward
  6  |  * as debt, reducing the available allocation in the current year.
  7  |  *
  8  |  * Setup: employee hired Jan 1 two years ago (full $2,000 allocation each prior
  9  |  * year). A $3,000 approved request created last year exceeds that year's
  10 |  * allocation by $1,000, so the current year's available allocation drops from
  11 |  * $2,000 to $1,000.
  12 |  */
  13 | test("prior-year overspend shows as carry-forward debt", async ({
  14 |   page,
  15 |   provisionUser,
  16 |   signInAs,
  17 | }) => {
  18 |   const year = new Date().getFullYear();
  19 |   const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-carry`);
  20 |   const employee = await provisionUser({
  21 |     role: "employee",
  22 |     clinicId,
  23 |     hireDate: `${year - 2}-01-01`,
  24 |   });
  25 | 
  26 |   await insertRequest({
  27 |     employeeId: employee.dbId,
  28 |     status: "awaiting_receipt",
  29 |     courseNames: "E2E Prior-Year Overspend Course",
  30 |     tuition: 3000,
  31 |     totalRequested: 3000,
  32 |     totalApproved: 3000,
  33 |     createdAt: new Date(year - 1, 5, 15),
  34 |   });
  35 | 
  36 |   await signInAs(employee);
  37 |   await page.goto("/requests/new");
  38 | 
  39 |   // The available budget value sits in the span immediately after its label;
  40 |   // likewise for carry-forward debt. Assert each value against its own label so
  41 |   // a single duplicated currency string can't mask a wrong number.
  42 |   await expect(
  43 |     page
  44 |       .getByText("Available budget:")
  45 |       .locator("xpath=following-sibling::span[1]"),
> 46 |   ).toHaveText("$1,000.00");
     |     ^ Error: expect(locator).toHaveText(expected) failed
  47 |   await expect(
  48 |     page
  49 |       .getByText("Carry-forward debt:")
  50 |       .locator("xpath=following-sibling::span[1]"),
  51 |   ).toHaveText("$1,000.00");
  52 | });
  53 | 
```