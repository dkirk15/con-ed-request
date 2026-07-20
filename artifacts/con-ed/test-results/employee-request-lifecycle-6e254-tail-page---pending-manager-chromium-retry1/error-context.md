# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: employee-request-lifecycle.spec.ts >> employee submits a draft request from the detail page -> pending_manager
- Location: tests/employee-request-lifecycle.spec.ts:63:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Draft', { exact: true })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByText('Draft', { exact: true })

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
  33  |     .fill("E2E Advanced Manual Therapy");
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
> 92  |   await expect(page.getByText("Draft", { exact: true })).toBeVisible();
      |                                                          ^ Error: expect(locator).toBeVisible() failed
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
  134 |     employeeId: employee.dbId,
  135 |     managerId: manager.dbId,
  136 |     status: "draft",
  137 |     courseNames: "E2E Draft Original Title",
  138 |     tuition: 200,
  139 |     totalRequested: 200,
  140 |   });
  141 | 
  142 |   await signInAs(employee);
  143 |   await page.goto(`/requests/${requestId}`);
  144 |   await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  145 | 
  146 |   // Edit the draft via PATCH /api/requests/:id from the authenticated session.
  147 |   const patchStatus = await page.evaluate(
  148 |     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  149 |     async (args: any) => {
  150 |       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  151 |       const token = await (window as any).Clerk?.session?.getToken();
  152 |       const res = await fetch(`/api/requests/${args.id}`, {
  153 |         method: "PATCH",
  154 |         headers: {
  155 |           "Content-Type": "application/json",
  156 |           Authorization: `Bearer ${token}`,
  157 |         },
  158 |         body: JSON.stringify({
  159 |           courseNames: args.courseNames,
  160 |           tuition: args.tuition,
  161 |           totalRequested: args.totalRequested,
  162 |         }),
  163 |       });
  164 |       return res.status;
  165 |     },
  166 |     { id: requestId, courseNames: "E2E Draft Edited Title", tuition: 300, totalRequested: 300 },
  167 |   );
  168 |   expect(patchStatus).toBe(200);
  169 | 
  170 |   // Verify the edit is reflected in the DB.
  171 |   const editedRow: RequestRow | undefined = await getRequest(requestId);
  172 |   expect(editedRow?.course_names).toBe("E2E Draft Edited Title");
  173 |   expect(Number(editedRow?.total_requested)).toBe(300);
  174 | 
  175 |   // Reload the page so the UI picks up the updated data, then submit via UI.
  176 |   await page.reload();
  177 |   await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  178 |   await page.getByRole("button", { name: "Submit Request" }).click();
  179 |   await expect(page.getByText("Pending Manager Approval")).toBeVisible();
  180 | 
  181 |   // DB confirms the final status.
  182 |   const finalRow = await getRequest(requestId);
  183 |   expect(finalRow?.status).toBe("pending_manager");
  184 | });
  185 | 
```