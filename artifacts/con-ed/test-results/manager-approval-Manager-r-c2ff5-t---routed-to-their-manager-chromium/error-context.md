# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: manager-approval.spec.ts >> Manager review >> manager submits their own request -> routed to their manager
- Location: tests/manager-approval.spec.ts:98:3

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
  15  |   test("manager approves a pending request -> pending_bo", async ({
  16  |     page,
  17  |     provisionUser,
  18  |     signInAs,
  19  |   }) => {
  20  |     const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-mgrapp`);
  21  |     const manager = await provisionUser({ role: "manager", clinicId });
  22  |     const employee = await provisionUser({
  23  |       role: "employee",
  24  |       clinicId,
  25  |       managerId: manager.dbId,
  26  |     });
  27  |     const requestId = await insertRequest({
  28  |       employeeId: employee.dbId,
  29  |       managerId: manager.dbId,
  30  |       status: "pending_manager",
  31  |       courseNames: "E2E Pending Approval Course",
  32  |       tuition: 400,
  33  |       totalRequested: 400,
  34  |     });
  35  | 
  36  |     await signInAs(manager);
  37  | 
  38  |     // Dashboard should show at least 1 request pending the manager's approval.
  39  |     await page.goto("/dashboard");
  40  |     const actionCard = page.locator("text=Action Required").locator("..");
  41  |     await expect(actionCard.locator("text=Requests pending your approval")).toBeVisible();
  42  |     const countText = await page
  43  |       .locator('[class*="text-3xl"][class*="font-bold"][class*="amber"]')
  44  |       .first()
  45  |       .textContent();
  46  |     expect(Number(countText?.trim())).toBeGreaterThanOrEqual(1);
  47  | 
  48  |     await page.goto(`/requests/${requestId}`);
  49  | 
  50  |     await page.getByRole("button", { name: "Approve" }).click();
  51  |     await expect(page.getByText("Pending Business Office")).toBeVisible();
  52  | 
  53  |     const row = await getRequest(requestId);
  54  |     expect(row?.status).toBe("pending_bo");
  55  |     expect(row?.manager_id).toBe(manager.dbId);
  56  |   });
  57  | 
  58  |   test("manager denies a pending request with a reason -> manager_denied", async ({
  59  |     page,
  60  |     provisionUser,
  61  |     signInAs,
  62  |   }) => {
  63  |     const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-mgrdeny`);
  64  |     const manager = await provisionUser({ role: "manager", clinicId });
  65  |     const employee = await provisionUser({
  66  |       role: "employee",
  67  |       clinicId,
  68  |       managerId: manager.dbId,
  69  |     });
  70  |     const requestId = await insertRequest({
  71  |       employeeId: employee.dbId,
  72  |       managerId: manager.dbId,
  73  |       status: "pending_manager",
  74  |       courseNames: "E2E To Be Denied Course",
  75  |       tuition: 700,
  76  |       totalRequested: 700,
  77  |     });
  78  | 
  79  |     await signInAs(manager);
  80  |     await page.goto(`/requests/${requestId}`);
  81  | 
  82  |     await page.getByRole("button", { name: "Deny" }).click();
  83  |     await page
  84  |       .getByPlaceholder("Reason for denial...")
  85  |       .fill("Budget exhausted for this cycle.");
  86  |     await page.getByRole("button", { name: "Confirm Denial" }).click();
  87  | 
  88  |     await expect(
  89  |       page
  90  |         .getByRole("heading", { name: /Request #\d+/ })
  91  |         .getByText("Manager Denied"),
  92  |     ).toBeVisible();
  93  | 
  94  |     const row = await getRequest(requestId);
  95  |     expect(row?.status).toBe("manager_denied");
  96  |   });
  97  | 
  98  |   test("manager submits their own request -> routed to their manager", async ({
  99  |     page,
  100 |     provisionUser,
  101 |     signInAs,
  102 |   }) => {
  103 |     const clinicId = await createClinic(`E2E-Clinic-${Date.now()}-mgrself`);
  104 |     // A senior manager who will receive the self-submitting manager's request.
  105 |     const senior = await provisionUser({ role: "manager", clinicId });
  106 |     const manager = await provisionUser({
  107 |       role: "manager",
  108 |       clinicId,
  109 |       managerId: senior.dbId,
  110 |     });
  111 | 
  112 |     await signInAs(manager);
  113 |     await page.goto("/requests/new");
  114 | 
> 115 |     await page.getByLabel("Course Name(s)").fill("E2E Manager Self Course");
      |                                             ^ TimeoutError: locator.fill: Timeout 20000ms exceeded.
  116 |     await page.locator('input[step="0.01"]').first().fill("300");
  117 |     await page.getByRole("button", { name: "Submit Request" }).click();
  118 | 
  119 |     await expect(page).toHaveURL(/\/requests\/\d+/);
  120 |     await expect(page.getByText("Pending Manager Approval")).toBeVisible();
  121 | 
  122 |     const id = requestIdFromUrl(page.url());
  123 |     const row = await getRequest(id);
  124 |     expect(row?.status).toBe("pending_manager");
  125 |     expect(row?.employee_id).toBe(manager.dbId);
  126 |     expect(row?.manager_id).toBe(senior.dbId);
  127 |   });
  128 | });
  129 | 
```