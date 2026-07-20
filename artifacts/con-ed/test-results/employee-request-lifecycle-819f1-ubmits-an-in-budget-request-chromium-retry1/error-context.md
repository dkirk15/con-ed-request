# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: employee-request-lifecycle.spec.ts >> employee creates and submits an in-budget request
- Location: tests/employee-request-lifecycle.spec.ts:15:1

# Error details

```
TimeoutError: locator.fill: Timeout 20000ms exceeded.
Call log:
  - waiting for getByLabel('Course Name(s)')

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
  2   | import { createClinic, insertRequest, getRequest } from "./helpers/db";
  3   | import type { RequestRow } from "./helpers/db";
  4   | 
  5   | function requestIdFromUrl(url: string): number {
  6   |   const match = url.match(/\/requests\/(\d+)/);
  7   |   if (!match) throw new Error(`No request id in URL: ${url}`);
  8   |   return Number(match[1]);
  9   | }
  10  | 
  11  | /**
  12  |  * An employee fills the New Request form within budget. The form creates the
  13  |  * draft and immediately submits it, so it lands in `pending_manager`.
  14  |  */
  15  | test("employee creates and submits an in-budget request", async ({
  16  |   page,
  17  |   provisionUser,
  18  |   signInAs,
  19  | }) => {
  20  |   const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-newreq`);
  21  |   const manager = await provisionUser({ role: "manager", clinicId });
  22  |   const employee = await provisionUser({
  23  |     role: "employee",
  24  |     clinicId,
  25  |     managerId: manager.dbId,
  26  |   });
  27  | 
  28  |   await signInAs(employee);
  29  |   await page.goto("/requests/new");
  30  | 
  31  |   await page
  32  |     .getByLabel("Course Name(s)")
> 33  |     .fill("E2E Advanced Manual Therapy");
      |      ^ TimeoutError: locator.fill: Timeout 20000ms exceeded.
  34  |   // Cost inputs wrap the <input> in a div for the "$" prefix, so the label's
  35  |   // htmlFor lands on the wrapper, not the input — target by the cost-only step.
  36  |   await page.locator('input[step="0.01"]').first().fill("500");
  37  | 
  38  |   await page.getByRole("button", { name: "Submit Request" }).click();
  39  | 
  40  |   await expect(page).toHaveURL(/\/requests\/\d+/);
  41  |   await expect(page.getByText("Pending Manager Approval")).toBeVisible();
  42  | 
  43  |   const id = requestIdFromUrl(page.url());
  44  |   const row = await getRequest(id);
  45  |   expect(row?.status).toBe("pending_manager");
  46  |   expect(Number(row?.total_requested)).toBe(500);
  47  |   expect(row?.requires_repayment_guarantee).toBe(false);
  48  | 
  49  |   // The submitted request appears in the employee's Requests list as pending.
  50  |   await page.goto("/requests");
  51  |   const requestRow = page
  52  |     .getByRole("row")
  53  |     .filter({ hasText: "E2E Advanced Manual Therapy" });
  54  |   await expect(requestRow).toBeVisible();
  55  |   await expect(requestRow.getByText("Pending Manager Approval")).toBeVisible();
  56  | });
  57  | 
  58  | /**
  59  |  * Employee draft lifecycle: a draft created directly in the DB is visible on
  60  |  * the request detail page with a "Submit Request" action. Clicking Submit
  61  |  * moves it to pending_manager.
  62  |  */
  63  | test("employee submits a draft request from the detail page -> pending_manager", async ({
  64  |   page,
  65  |   provisionUser,
  66  |   signInAs,
  67  | }) => {
  68  |   const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-draft`);
  69  |   const manager = await provisionUser({ role: "manager", clinicId });
  70  |   const employee = await provisionUser({
  71  |     role: "employee",
  72  |     clinicId,
  73  |     managerId: manager.dbId,
  74  |   });
  75  | 
  76  |   // Insert a draft directly — mirrors the state after NewRequestPage creates
  77  |   // the record but before the submit call fires (e.g. if submit fails).
  78  |   const requestId = await insertRequest({
  79  |     employeeId: employee.dbId,
  80  |     managerId: manager.dbId,
  81  |     status: "draft",
  82  |     courseNames: "E2E Draft Lifecycle Course",
  83  |     tuition: 350,
  84  |     totalRequested: 350,
  85  |   });
  86  | 
  87  |   await signInAs(employee);
  88  |   await page.goto(`/requests/${requestId}`);
  89  | 
  90  |   // Draft status badge is visible (use exact match to avoid substring hits
  91  |   // from the course name and clinic name which also contain "Draft").
  92  |   await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  93  | 
  94  |   // The "Submit Request" action is available to the owner.
  95  |   await expect(
  96  |     page.getByRole("button", { name: "Submit Request" }),
  97  |   ).toBeVisible();
  98  | 
  99  |   // Submit the draft.
  100 |   await page.getByRole("button", { name: "Submit Request" }).click();
  101 | 
  102 |   // Status transitions to pending_manager in the UI.
  103 |   await expect(page.getByText("Pending Manager Approval")).toBeVisible();
  104 | 
  105 |   // Confirm the DB row was updated.
  106 |   const row = await getRequest(requestId);
  107 |   expect(row?.status).toBe("pending_manager");
  108 | });
  109 | 
  110 | /**
  111 |  * Employee edits a draft via PATCH /api/requests/:id (called from the
  112 |  * authenticated browser session), then submits it via the UI.
  113 |  *
  114 |  * Draft editing is supported by the API but not yet surfaced in the UI —
  115 |  * the NewRequestPage creates and immediately submits in one step. This test
  116 |  * exercises the edit path through the real API endpoint so the route, auth
  117 |  * guard, and field updates are all covered.
  118 |  */
  119 | test("employee edits a draft via the API then submits via UI -> pending_manager", async ({
  120 |   page,
  121 |   provisionUser,
  122 |   signInAs,
  123 | }) => {
  124 |   const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-edit`);
  125 |   const manager = await provisionUser({ role: "manager", clinicId });
  126 |   const employee = await provisionUser({
  127 |     role: "employee",
  128 |     clinicId,
  129 |     managerId: manager.dbId,
  130 |   });
  131 | 
  132 |   // Seed an initial draft.
  133 |   const requestId = await insertRequest({
```