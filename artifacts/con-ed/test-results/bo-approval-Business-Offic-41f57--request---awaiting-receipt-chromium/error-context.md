# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bo-approval.spec.ts >> Business Office review >> BO final-approves a request -> awaiting_receipt
- Location: tests/bo-approval.spec.ts:10:3

# Error details

```
TimeoutError: locator.click: Timeout 20000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Final Approve' })

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
  1  | import { test, expect } from "./fixtures";
  2  | import { createClinic, insertRequest, getRequest } from "./helpers/db";
  3  | 
  4  | /**
  5  |  * The Business Office gives final sign-off on manager-approved requests.
  6  |  * Final Approve sets the approved amounts and moves to `awaiting_receipt`;
  7  |  * denying moves to `bo_denied`.
  8  |  */
  9  | test.describe("Business Office review", () => {
  10 |   test("BO final-approves a request -> awaiting_receipt", async ({
  11 |     page,
  12 |     provisionUser,
  13 |     signInAs,
  14 |   }) => {
  15 |     const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-boapp`);
  16 |     const bo = await provisionUser({ role: "business_office" });
  17 |     const employee = await provisionUser({ role: "employee", clinicId });
  18 |     const requestId = await insertRequest({
  19 |       employeeId: employee.dbId,
  20 |       status: "pending_bo",
  21 |       courseNames: "E2E Awaiting BO Course",
  22 |       tuition: 600,
  23 |       totalRequested: 600,
  24 |     });
  25 | 
  26 |     await signInAs(bo);
  27 |     await page.goto(`/requests/${requestId}`);
  28 | 
> 29 |     await page.getByRole("button", { name: "Final Approve" }).click();
     |                                                               ^ TimeoutError: locator.click: Timeout 20000ms exceeded.
  30 | 
  31 |     // The approval dialog exposes one number input per cost category, in order:
  32 |     // Tuition, Lodging, Airfare, Rental Car, Parking, Other. The BO can adjust
  33 |     // each before confirming; total_approved must equal their sum.
  34 |     const dialog = page.getByRole("dialog");
  35 |     const amounts = dialog.locator('input[type="number"]');
  36 |     await amounts.nth(0).fill("500"); // Tuition
  37 |     await amounts.nth(1).fill("100"); // Lodging
  38 |     await amounts.nth(5).fill("50"); // Other
  39 | 
  40 |     await page.getByRole("button", { name: "Confirm Approval" }).click();
  41 | 
  42 |     await expect(page.getByText("Awaiting Receipt")).toBeVisible();
  43 | 
  44 |     const row = await getRequest(requestId);
  45 |     expect(row?.status).toBe("awaiting_receipt");
  46 |     expect(Number(row?.approved_tuition)).toBe(500);
  47 |     expect(Number(row?.approved_lodging)).toBe(100);
  48 |     expect(Number(row?.approved_other)).toBe(50);
  49 |     expect(Number(row?.total_approved)).toBe(650);
  50 |     expect(row?.bo_approver_id).toBe(bo.dbId);
  51 |   });
  52 | 
  53 |   test("BO denies a request with a reason -> bo_denied", async ({
  54 |     page,
  55 |     provisionUser,
  56 |     signInAs,
  57 |   }) => {
  58 |     const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-bodeny`);
  59 |     const bo = await provisionUser({ role: "business_office" });
  60 |     const employee = await provisionUser({ role: "employee", clinicId });
  61 |     const requestId = await insertRequest({
  62 |       employeeId: employee.dbId,
  63 |       status: "pending_bo",
  64 |       courseNames: "E2E BO Deny Course",
  65 |       tuition: 900,
  66 |       totalRequested: 900,
  67 |     });
  68 | 
  69 |     await signInAs(bo);
  70 |     await page.goto(`/requests/${requestId}`);
  71 | 
  72 |     await page.getByRole("button", { name: "Deny" }).click();
  73 |     await page
  74 |       .getByPlaceholder("Reason for denial...")
  75 |       .fill("Outside policy for this category.");
  76 |     await page.getByRole("button", { name: "Confirm Denial" }).click();
  77 | 
  78 |     await expect(page.getByText("BO Denied")).toBeVisible();
  79 | 
  80 |     const row = await getRequest(requestId);
  81 |     expect(row?.status).toBe("bo_denied");
  82 |   });
  83 | });
  84 | 
```