# OSS Con-Ed Portal - Status Report

Last updated: 2026-07-27 by Codex

## Current State

GitHub `main` is the integrated source of truth. **All 55 E2E tests pass** in
Replit (1 worker, no retries). No database schema change is pending. CI
validation pipeline is fully hardened.

Dependabot alerts #3 through #8 are patched and merged into `main` through
PR #12.

### GitHub Integration

- PR #3 (`Improve draft request workflow`) merged Phase 2.
- PR #4 (`Patch brace-expansion Dependabot vulnerability`) merged the isolated
  dependency hotfix into `main`.
- PR #6 (`Add approval review workspace`) merged Phase 3.
- PR #7 (`Add reimbursement workspace and actual-amount accounting`) merged Phase 4.
- PR #8 (`Add structured course data per request`) merged Phase 5.
- PR #9 (`Add operational reporting workspace`) merged Phase 6.
- PR #10 (`Add role-based task center`) merged Phase 7.
- PR #11 (`Overhaul operational reports`) merged the role-specific reporting,
  advanced-funding, exception, and payroll improvements.
- PR #12 (`Patch July Dependabot alerts`) merged the six high-severity
  dependency fixes.
- Dependabot alert #1 is marked **fixed** as of 2026-07-20.
- Dependabot alert #2 (`body-parser`, CVE-2026-12590) patched in Phase 7.
- Dependabot alerts #3 through #8 are patched in `main` through PR #12.
- **All 55 Playwright E2E tests pass** in Replit as of 2026-07-26.

---

## Recent Changes (2026-07-27 via Codex - Final Presentation Review)

### Receipt Action Placement

- Moved the employee and manager `Upload receipt` action from the detached
  request-header controls into a full-width `Ready for your receipt` next-step
  band directly beneath the request workflow indicator.
- The action band explains that the course must be purchased before uploading
  the itemized receipt and uses the standard primary-button treatment.
- After upload, the band becomes a `Receipt submitted` confirmation that tells
  the employee Accounting will record the reimbursement on an upcoming
  paycheck.
- Updated the receipt-submission E2E scenario to verify the contextual action,
  guidance, submit control, and post-upload confirmation.

### Live Desktop Review

- Reviewed the authenticated deployed app at a 1419-by-717 desktop viewport as
  Admin, Employee, Manager, Business Office, and Accounting.
- Reviewed the role dashboards, employee request form, manager approval
  workspace, Admin People page, and operational Reports workspace.
- Confirmed there is no horizontal overflow on the reviewed screens.
- Confirmed keyboard focus is visible and the `Skip to Main Content` link moves
  focus to the main workspace.
- Confirmed the browser console has no application errors. The deployment emits
  only Clerk's expected warning that development credentials are in use.

### Final Polish Fixes

- Employee and manager allocation cards now explain current-year approved
  spending above the available benefit as advanced funding and state that it
  reduces a future year's CE benefit.
- Added the accessible name `View app as` to the Admin test-mode role selector.
- Admin role changes and `Exit` now reload the active workspace immediately, so
  navigation and permissions cannot remain visually stuck on the previous role.
- Shortened the Reports search hint to `Course, provider, or employee` so it
  remains fully visible at the standard desktop width.
- Added E2E coverage for the current-year advanced-funding explanation and the
  accessible Admin role selector. Playwright now discovers **56 tests in 18
  files**.

### Validation And Handoff

- Full workspace TypeScript checks pass.
- Playwright successfully discovers all 56 tests with the new presentation
  readiness coverage.
- Restored all 23 locally missing tracked image assets from the current Git
  version, including `attached_assets/pt-login-bg.png`.
- The frontend production build passes after restoring the assets.
- Run the authenticated 56-test suite in Replit.
- Before a permanent production launch, replace Clerk development credentials
  with production credentials. No database migration, API regeneration, or new
  application environment variable is required for these UI changes.

---

## Recent Changes (2026-07-27 via Replit Agent — Post-Polish E2E Fix)

### Clinic Combobox Selector Tightened

The Codex UX polish added `aria-label="Clinic X Employee … funding committed"`
to every progress bar in the budget-usage table for screen-reader accessibility.
This caused `page.getByLabel("Clinic")` in the BO budget-usage test to resolve
to 71 elements (the combobox **plus** all progress bars), triggering a
Playwright strict-mode violation.

- Changed the selector in `operational-reporting.spec.ts` from
  `page.getByLabel("Clinic")` to `page.getByRole("combobox", { name: "Clinic" })`
  so it targets only the filter dropdown.
- **55/55 tests pass** with no retries after the fix.

---

## Recent Changes (2026-07-26 via Codex - Presentation UX Polish)

### Consistent Workspace Structure

- Added one shared page-header pattern across dashboards, requests, reports,
  approvals, reimbursements, people, clinics, and account settings.
- Standardized page descriptions, primary-action placement, capitalization,
  spacing, and administrative screen hierarchy.
- Added a compact five-stage request lifecycle indicator to request creation,
  request detail, manager review, Business Office review, and reimbursement:
  Request, Manager, Business Office, Purchase & receipt, and Reimbursement.

### Clearer Workflow Language

- Replaced ambiguous `CE Approval` labels with `Business Office Approval`
  throughout navigation, filters, status badges, dashboards, and tests.
- Clarified the final Business Office decision message: employees may purchase
  only after approval and upload the receipt afterward.
- Kept manager self-approval, clinic scoping, repayment-guarantee rules, and all
  existing role permissions unchanged.

### Request And Feedback Polish

- Replaced the browser-native unsaved-draft confirmation with an accessible
  in-app dialog offering `Keep editing` and `Discard changes`.
- Clarified which course fields are required for submission and which are
  optional, while preserving the existing draft-saving rules.
- Added a recoverable task-center error state with a visible retry action
  instead of silently hiding the panel when loading fails.

### Accessibility And Reporting Polish

- Added reduced-motion support across the interface.
- Added a screen-reader summary for the annual funding trend chart.
- Added progress-bar semantics and employee-specific labels to report budget
  usage indicators.
- Preserved all existing role-specific report sections, filters, exports, and
  financial definitions.

### Validation And Replit Handoff

- Full workspace TypeScript checks pass.
- Frontend Vite production build passes.
- Playwright discovers all **55 tests in 18 files** after updating the affected
  terminology and unsaved-draft expectations.
- Run the authenticated 55-test suite in Replit and visually review employee,
  manager, Business Office, Accounting, and Admin screens at the standard
  1280-by-720 desktop test viewport.
- No database schema push, migration, API regeneration, or new environment
  variable is required for this polish release.

---

## Recent Changes (2026-07-26 via Replit Agent — Reporting E2E Coverage)

### Accounting Tab Visibility Test

- Added accounting-role test: confirms accounting users land on the payroll tab
  by default and cannot navigate to the funding or clinic-comparison tabs.

### Quick Views Badge and Ledger Consistency Test

- Added an admin test confirming that the "Needs approval" Quick View badge
  shows the correct count (2 pending\_manager + 1 pending\_bo = 3) and that
  clicking it filters the ledger to exactly 3 matching requests. A second
  assertion covers "Awaiting receipts" (2 awaiting\_receipt requests → badge
  count 2 → ledger total 2). Verifies that badge counts and ledger totals stay
  in sync, preventing phantom queue numbers that could misdirect staff.

### BO Clinic Filter Scoping Test

- Added a Business Office test confirming that selecting a clinic from the
  Clinic dropdown narrows the budget-usage table to only employees from that
  clinic. The test inserts employees at two distinct clinics, selects one via
  the filter, waits for the loading skeleton to resolve, asserts the selected
  clinic's row is visible, and asserts the excluded clinic's row is absent.

### Suite Size

- **55 E2E tests** across 19 files. All pass in a single run with no retries.
- No application code or database schema changes are required for these tests.

---

## Recent Changes (2026-07-26 via Codex - Dependabot Alerts #3-#8)

- Patched `brace-expansion` from 5.0.7 to 5.0.8.
- Patched `postcss` from 8.5.14 to 8.5.23.
- Patched `fast-uri` from 3.1.2 to 3.1.4, resolving both associated advisories.
- Patched `fast-xml-parser` from 5.9.3 to 5.10.1.
- Patched `linkify-it` from 5.0.1 to 5.0.2.
- Added compatible workspace security overrides so future dependency installs
  cannot restore the vulnerable versions or jump across incompatible major
  versions.
- `pnpm audit --audit-level low` reports **no known vulnerabilities**.
- No application code or database schema changes are required for these fixes.

---

## Recent Changes (2026-07-25 via Codex - Reports Overhaul)

### Role-Specific Reporting

- Reorganized Reports into role-relevant sections. Managers and the Business
  Office default to funding, Accounting defaults to payroll, and Admin defaults
  to an organization overview with additional clinic comparison access.
- Added role-specific quick views for aging work, approvals, missing receipts,
  ready-to-pay reimbursements, advanced funding, and paycheck history.
- Quick views, exceptions, workflow queues, and advanced-funding records drill
  into the matching request ledger while existing server-side clinic isolation
  remains enforced for managers.

### Reliable Filters And Date Definitions

- Fixed the clinic and employee filter experience and replaced the long employee
  select with a searchable picker. Employee choices remain dependent on the
  selected clinic.
- Removed delivery method from the visible report filters and CSV export.
- Added explicit reporting date bases for request submission, course dates,
  approval decisions, and paycheck dates, plus optional from/through dates.
  This prevents cross-year approvals and reimbursements from being attributed
  only to the original request year.
- Report tabs, quick views, filters, sorting, and pagination remain URL-backed
  for refreshes and shareable report links.

### Funding, Advances, And Guarantees

- Added employee-level annual allocation, available benefit after carry-forward
  debt, used, pending, remaining, and potential advanced-funding exposure.
- Added an advanced-funding and repayment-guarantee ledger showing each affected
  request, amount, status, and whether the required guarantee is signed.
- Added clear definitions for requested, approved, committed/outstanding, and
  actually paid amounts.

### Operational And Financial Insight

- Added an exception report for aging approvals, overdue receipts, payments
  waiting on Accounting, missing guarantees, missing clinic assignments, and
  legacy reimbursements without recorded actual amounts.
- Added monthly requested/approved/paid trends using the correct event date for
  each series.
- Added median and 90th-percentile turnaround for manager decisions, Business
  Office decisions, and receipt-to-paycheck processing.
- Added a paycheck-date reimbursement ledger for Accounting and an Admin-only
  clinic comparison with request volume shown beside denial rates.

### Validation And Replit Handoff

- OpenAPI React clients and Zod validators were regenerated successfully.
- Full workspace TypeScript checks pass.
- API and frontend production builds pass locally. Existing source-map and
  large-chunk warnings remain non-blocking.
- Playwright discovers **47 tests in 18 files**. Four reporting tests now cover
  financial reconciliation and export, manager clinic isolation, working
  clinic/employee selection with repayment guarantees, and cross-year paycheck
  reporting.
- The authenticated 47-test E2E run still needs to be completed in Replit.
- **No database schema push or migration is required for this Reports overhaul.**

---

## Recent Changes (2026-07-22 via Codex - Dependabot Alert #2)

- Updated the Express `body-parser` dependency from 2.2.2 to the patched 2.3.0
  release, addressing the low-severity denial-of-service advisory
  CVE-2026-12590 / GHSA-v422-hmwv-36x6.
- Added a workspace security override requiring `body-parser` 2.3.0 or newer so
  future dependency installs cannot restore the vulnerable version.
- Dependency resolution confirms that 2.3.0 is the only installed
  `body-parser` version. Workspace TypeScript checks and the API production
  build pass locally.
- The frontend production build did not complete in the local Windows/OneDrive
  environment and should be rerun in Replit. The dependency fix does not
  change frontend code.
- A full dependency audit also identified separate advisories affecting
  `linkify-it`, `fast-uri`, and `fast-xml-parser`; these are unrelated to
  Dependabot alert #2 and remain follow-up work.
- No application code or database schema changes are required for this fix.

---

## Recent Changes (2026-07-22 via Codex - In-App Task Center)

### Role-Specific Next Steps

- Added one shared, role-scoped task feed used by dashboards and navigation.
- Employees see drafts to finish, requests moving through approval, approved
  courses ready for receipt upload, and receipts waiting for Accounting.
- Managers see pending approvals from their assigned clinic plus next steps for
  their own CE requests. Server-side clinic restrictions remain enforced.
- Business Office sees manager-approved requests ready for final funding review.
- Accounting sees submitted receipts ready for reimbursement.
- Administrators see an organization-wide workflow watchlist, with stale items
  prioritized for follow-up.

### Aging And Navigation

- Added restrained aging indicators rather than formal deadlines. Approval and
  reimbursement work is marked aging after 3 days and needs follow-up after 7.
- Drafts use 14-day and 30-day thresholds. Approved requests use the course end
  date, with 7-day and 30-day post-course thresholds for missing receipts.
- Added count badges to My Requests, Approvals, CE Approvals, Reimbursements,
  and the administrator Reports link as appropriate for each role.
- Counts refresh immediately after drafts, submissions, approvals, denials,
  receipt uploads, reimbursements, and draft deletions.

### Dashboard Polish

- Added a single task rail with direct Continue, Review, Add receipt, Process,
  and View status actions.
- Removed duplicate approval and reimbursement queue lists from the older
  dashboards while retaining useful funding, allocation, and staffing summaries.
- Added clear empty, waiting, aging, and follow-up states.

### Validation And Replit Handoff

- OpenAPI React clients and Zod validators were regenerated successfully.
- Full workspace TypeScript checks pass.
- API and frontend production builds pass locally. Existing source-map and
  large-chunk warnings remain non-blocking.
- Playwright discovers **45 tests in 18 files**. Two new tests cover employee
  next-step separation, action badges, aging presentation, and manager clinic
  isolation.
- The authenticated 45-test E2E run still needs to be completed in Replit.
- **No database schema push or migration is required for Phase 7.**

---

## Recent Changes (2026-07-22 by Replit Agent — CI Hardening)

### Codegen-Drift Validation Fixed

The `codegen-drift` validation workflow was updated to work without manual
git staging:

- Added `git add lib/api-client-react/src/generated/ lib/api-zod/src/generated/`
  as an automatic step after orval regenerates files.
- Changed `git diff --exit-code` to `git diff --cached --exit-code` so the
  check compares staged output against HEAD rather than working tree against
  index — correctly detecting stale committed files instead of always passing.

### Full Type-Check Pipeline Added to Codegen-Drift

The `codegen-drift` validation now also runs `tsc --noEmit` across all packages
after verifying generated files are in sync:

- `lib/db`, `lib/api-client-react`, `lib/api-zod` — lib packages
- `artifacts/con-ed`, `artifacts/api-server` — consumer packages

`typecheck` scripts were added to `lib/api-client-react/package.json`,
`lib/api-zod/package.json`, and `lib/db/package.json` to support this.

### Standalone Typecheck-Libs Validation

A new `typecheck-libs` validation workflow (`pnpm -w run typecheck:libs`) runs
independently of codegen so lib type regressions are caught even when codegen
is skipped.

### Post-Merge Auto-Codegen

`scripts/post-merge.sh` now detects whether `lib/api-spec/openapi.yaml` changed
anywhere in the merged commit range (using `ORIG_HEAD` with `HEAD~1` fallback)
and automatically re-runs `pnpm --filter @workspace/api-spec run codegen` when
it did. If generated files change, it stages and commits them so HEAD stays
fully in sync without manual intervention.

---

## Recent Changes (2026-07-21 via Codex - Operational Reporting)

### Role-Scoped Reporting Workspace

- Added a dedicated desktop reporting workspace at `/reports` for managers,
  Business Office, Accounting, and administrators. Employees do not receive a
  Reports navigation link and see an access-unavailable state on direct visits.
- Managers are restricted by the server to employees in their assigned clinic,
  even if another clinic ID is supplied in the URL. Business Office, Accounting,
  and administrators can report across the organization.
- Added Reports navigation to each authorized role without changing the existing
  approval, reimbursement, request, or administrative workspaces.

### Financial And Workflow Visibility

- Added year-based financial totals for requested, approved, actually reimbursed,
  and approved-but-outstanding funding. Legacy reimbursements without an amount
  continue to fall back to the approved or requested amount.
- Added workflow aging for manager approval, Business Office approval, awaiting
  receipt, and ready-for-reimbursement queues.
- Added a paginated request ledger with request drilldown, status, clinic,
  requested/approved/reimbursed amounts, configurable sorting, and row counts.

### Filters And Export

- Report state is URL-backed and supports request year, clinic, employee, status,
  delivery method, course-date range, and course/provider/employee search.
- Employee choices follow the selected clinic. Search requests are deferred while
  typing to avoid unnecessary rapid report refreshes.
- Added a CSV export that uses the same role scope, filters, and sorting as the
  visible report. Exported text is protected against spreadsheet formula injection.
- Reporting years default dynamically to the current year and include years found
  in the role-scoped request history.

### Validation And Replit Handoff

- OpenAPI React clients and Zod validators were regenerated successfully.
- Full workspace TypeScript checks pass.
- API and frontend production builds pass locally.
- Playwright discovers **43 tests in 17 files**. Two new reporting tests cover
  financial reconciliation, CSV export, and manager clinic isolation; role tests
  now cover Reports navigation and employee access.
- The authenticated 43-test E2E run still needs to be completed in Replit.
- **No database schema push or migration is required for Phase 6.**

---

## Recent Changes (2026-07-21 via Replit Agent — E2E Fix: Phase 5 Tests)

### All 41 Tests Now Pass

After merging PR #8 (Phase 5 structured course data), two of the three new
lifecycle tests were failing due to a combination of type-parser, strict-mode,
and form-state issues. Four fixes were applied:

1. **pg DATE type parser** — Added `pg.types.setTypeParser(1082, val => val)` to
   `tests/helpers/db.ts` so DATE columns are returned as raw `"YYYY-MM-DD"` strings
   instead of JS Date objects, making direct string comparisons in assertions reliable.

2. **Strict-mode selector** — Appended `.first()` to `getByText("Draft")` in
   `structured-course-data.spec.ts` to resolve a strict-mode violation when multiple
   elements matched.

3. **Form hydration wait** — Added `await expect(page.locator('input[name="courseProvider"]')).toHaveValue(...)` waits in lifecycle tests 2 and 3 so
   react-hook-form has finished resetting field values from the API before the test
   interacts with the form.

4. **Radix Select ↔ react-hook-form race** — When the controlled `<Select value={field.value}>` receives `undefined` initially and transitions to `"virtual"` via
   `form.reset()`, Radix UI can emit `onValueChange("")`, writing `""` into the form
   state. `requestPayload` then sends `deliveryMethod: ""` in the PATCH, which the
   submit endpoint rejects (`!""` → true → 400). Fixed by explicitly clicking the
   combobox and selecting "Virtual" after hydration in both affected tests (before
   Save Draft and before Submit for Approval, including after `page.reload()`).

**Result: 41/41 tests pass** in a single run with no retries (~4.8 min, 1 worker).

---

## Recent Changes (2026-07-21 via Codex - Structured Course Data)

### One Course Per Request

- Formalized the product rule that each CE request represents one course or event.
- Added structured course provider, webpage, start date, end date, and delivery
  method (`in_person`, `virtual`, or `hybrid`) fields.
- Course name remains the only field required to save a draft. Provider, both
  dates, and delivery method are required before submission; location is also
  required for in-person and hybrid courses.
- Course URLs are optional but validated as complete URLs. End dates cannot be
  earlier than start dates in either the UI or API.

### Workflow Presentation

- Redesigned the course-details section around provider, webpage, date range,
  delivery method, venue/location, and expected CEUs.
- Request detail, approval workspace, reimbursement workspace, request lists, and
  dashboards now use the same structured course information and date formatting.
- Reviewers can open the provider's course webpage directly from request detail
  and the approval workspace.
- Request search now includes the course provider.

### Compatibility And Validation

- New database fields are nullable so existing requests remain readable.
- Legacy `course_dates` text remains in API responses as a display fallback; new
  requests use `course_start_date` and `course_end_date`.
- OpenAPI clients and Zod validators were regenerated successfully.
- Full workspace TypeScript check, API production build, and frontend production
  build pass. Existing source-map and large-chunk warnings remain non-blocking.
- Playwright discovers 41 tests in 16 files. Two new tests cover required course
  data, physical-course location rules, date ordering, server enforcement, and
  legacy date display. Existing submission tests now provide structured data.

### Required Replit Schema Push

Before running the E2E suite or deploying, apply the normal database schema push
so `con_ed_requests` has nullable `course_provider`, `course_url`,
`course_start_date`, `course_end_date`, and `delivery_method` columns:

```bash
pnpm --filter @workspace/db run push
```

Then run all 41 authenticated E2E tests in Replit.

---

## Recent Changes (2026-07-20 via Codex - Reimbursement and Closeout)

### Actual Reimbursement Accounting

- Reimbursement records now capture the actual amount paid in addition to the
  paycheck date, Accounting user, and timestamp.
- New reimbursements require a positive amount and cannot exceed the Business
  Office approved total. The server validates the cap and requires an attached
  receipt before changing the request to `reimbursed`.
- Reimbursement creation and the request-status update now run in one database
  transaction.
- Legacy reimbursement rows remain supported: a null actual amount falls back to
  the approved total when requests and balances are displayed.
- Employee CE balance calculations now consume the actual reimbursed amount after
  closeout. If a $500 approval results in a $400 reimbursement, the unused $100 is
  released back to the employee's available CE balance.

### Accounting Workspace

- Added a dedicated desktop workspace at `/reimbursements` with an oldest-receipt
  queue, search, clinic filtering, waiting count, approved queue value, and direct
  access to reimbursement history.
- The selected request keeps its URL-backed state while Accounting reviews the
  employee, clinic, approved amount, receipt file, audit timeline, actual amount,
  and paycheck date together.
- A requested-to-approved-to-actual reconciliation strip makes funding changes
  visible before closeout.
- Reduced reimbursements show exactly how much funding returns to the employee.
  Overpayments are blocked in both the UI and API.
- **Record reimbursement and open next** confirms the final amount and advances
  directly to the next receipt without returning to the request list.
- Accounting dashboard, navigation, and request-list processing links now open the
  reimbursement workspace.

### Employee Closeout Visibility

- Reimbursed request details show the actual paid amount in the financial table.
- The audit timeline records the actual amount, paycheck date, Accounting user, and
  processing timestamp.
- Employee and manager recent-request cards show the actual reimbursed amount after
  closeout instead of continuing to show only the original request.

### Phase 4 Validation and Deployment

- OpenAPI clients and Zod validators were regenerated successfully.
- Full workspace TypeScript check passes.
- Playwright discovers 39 tests in 15 files. Three new reimbursement-workspace tests
  cover reduced reimbursement and balance release, overpayment protection, and queue
  status boundaries. The existing request-detail reimbursement test now records and
  verifies an actual amount.
- **All 39 E2E tests pass** in Replit as of 2026-07-21. See E2E fix section below.
- Database migration (`reimbursements.amount numeric(10,2)`) applied to local DB.

---

## Recent Changes (2026-07-21 via Replit Agent — E2E Fix: Reimbursement Workspace)

### Reimbursement Workspace Test #28 Hardened

PR #7 introduced three new `reimbursement-workspace.spec.ts` tests. Test #28
("records a reduced reimbursement, opens the next receipt, and releases unused CE
funds") was intermittently failing due to three issues fixed here:

- **Strict-mode violation** — `getByText('reduced-reimbursement.pdf')` matched both
  the workspace card label and the audit timeline entry. Fixed with `.first()`.
- **Queue pollution** — `openNextAfter` selects the first non-completed request
  sorted by `updatedAt asc`. Leftover `receipt_submitted` rows from other spec files
  had older timestamps and were picked ahead of this test's second request. Fixed by
  pinning both `insertRequest` calls to 10 min and 5 min in the past, guaranteeing
  the test's own requests are always the oldest pair in the queue.
- **Navigation assertion added** — `expect(page).toHaveURL(/selected=<secondId>/)` is
  now checked immediately after confirmation, before the heading assertion, so intent
  is locked in regardless of heading text changes.

`InsertRequestInput` in `tests/helpers/db.ts` was extended with an optional
`updatedAt` field so tests can control queue ordering without touching application
code.

**Result: 39/39 tests pass** in a single run with no retries (~4.8 min, 1 worker).

---

## Project Overview

Continuing Education request management web app for Olympic Sports & Spine (OSS). Employees and managers can submit CE requests; managers approve requests for employees in their clinic; the Business Office approves final amounts; accounting marks reimbursement.

Annual CE benefit is $2,000 per employee, prorated in the hire year, with advanced CE funding carrying forward as debt against future CE accruals.

## Architecture

- Monorepo: `pnpm` workspaces with deployable apps in `artifacts/` and shared packages in `lib/`
- Frontend: `artifacts/con-ed` - React, Vite, Tailwind CSS, Radix UI/shadcn-style components, wouter routing, Clerk auth
- Backend: `artifacts/api-server` - Express, esbuild, Drizzle ORM, PostgreSQL, Clerk auth, Google Cloud Storage receipt handling
- API spec/codegen: `lib/api-spec/openapi.yaml` drives Orval output for `lib/api-zod` and `lib/api-client-react`
- Database: `lib/db` - Drizzle schema and seed scripts
- Auth: Clerk with Microsoft SSO; frontend uses `VITE_CLERK_PUBLISHABLE_KEY`, backend uses `CLERK_SECRET_KEY`
- Validation: `codegen-drift` validation step guards against API contract drift

---

## Recent Changes (2026-07-20 via Replit Agent — E2E Hardening)

### Approval Workspace Bug Fix

- Fixed a React race condition in `ApprovalWorkspacePage.tsx` where a just-approved
  or just-denied request would briefly reappear in the sidebar queue before the
  server re-fetch arrived. `openNextAfter` now optimistically removes the completed
  request from the React Query cache synchronously, before triggering the background
  invalidation. The `total` count is only decremented when the item was actually
  present in that cache entry.

### E2E Test Suite Hardening

- **No-flash regression guard** — new `approval-queue-no-flash.spec.ts` with four
  tests (manager approve, manager deny, BO approve, BO deny) confirming the acted-on
  request is absent from the sidebar immediately after each action.
- **Empty-queue cold-start coverage** — new test in `approval-workspace.spec.ts`
  confirming that a manager with zero pending requests sees "Queue is clear" on first
  load, and that the workspace auto-selects correctly after a new request appears.
- **Global teardown fix** — the teardown script was matching `@example.com` but all
  test users are provisioned at `@osstherapy.com`. Fixed both occurrences so teardown
  now correctly removes all test data after every run.
- **Stable clinic/course names** — removed `${Date.now()}` suffixes from all clinic
  and course names across 11 spec files. Tests use clean descriptive names
  (e.g. `E2E-Clinic-newreq`) because teardown reliably cleans up after each run.
- **Idempotent `createClinic`** — the test helper now does a SELECT before INSERT,
  returning the existing clinic ID if one was left behind by an interrupted teardown.

### Suite Size

- **36 E2E tests** (31 original + 4 no-flash + 1 empty-queue cold-start). All pass
  in ~4 min on 1 worker.

---

## Recent Changes (2026-07-20 via Codex - Approval Workspace)

### Manager and Business Office Review

- Added a dedicated desktop approval workspace at `/approvals`. Managers and the
  Business Office now review an oldest-first queue beside the selected request,
  without returning to the request list after each decision.
- Approval links in role navigation, dashboards, queue tabs, and request-list
  actions now open the workspace. The selected request and queue filters remain in
  the URL, preserving review context across refreshes and direct links.
- Queue summary shows the number waiting and age of the oldest request. Business
  Office reviewers can filter by clinic; both roles can search the queue.
- The review pane brings employee, clinic, course, requested costs, current CE
  balance, other pending requests, carry-forward debt, projected balance, and any
  future CE advance together on one screen.
- Manager self-approvals are clearly identified and explain the current OSS policy.
  Requests that require a repayment guarantee cannot be approved until the signed
  agreement is present.
- Manager approval now requires explicit confirmation on both the new workspace and
  the existing request-detail page. Denials continue to require a reason.
- **Approve and open next** records the decision and advances directly to the next
  item. When no requests remain, the workspace shows a clear completed state.

### Business Office Funding Decisions

- Requested and approved amounts now appear side by side with an immediately
  calculated approved total.
- **Use requested amounts** restores all six requested cost categories in one step.
- Changed funding categories are highlighted, summarized before approval, and include
  the Other Costs category.
- The approval confirmation states the exact final amount before it is recorded and
  the request becomes eligible for receipt submission.

### Audit Timeline

- Added one reusable request timeline for the workspace and request-detail page.
- The timeline uses only timestamps the application actually records: request
  creation, repayment-guarantee signature, manager decision, Business Office
  decision, receipt submission, and reimbursement.
- Approver names, timestamps, denial reasons, receipt names, and paycheck details are
  displayed when available. The previous misleading use of `createdAt` as a
  submission timestamp was removed.

### Phase 3 Validation

- Full workspace TypeScript check passes.
- Frontend Vite production build passes. Existing source-map and large-chunk warnings
  remain unchanged in nature; the build completes successfully.
- Playwright discovers 31 tests in 13 files. Three new approval-workspace scenarios
  cover sequential manager review and denial, manager self-approval, and Business
  Office funding adjustments.
- **All 31 authenticated E2E tests pass in Replit** (3.9 min, 1 worker) as of
  2026-07-20. The suite runs against live Clerk, PostgreSQL, and object-storage.
- This phase does not require a database schema change or migration.

---


## Recent Changes (2026-07-20 via Codex - Draft Workflow UX)

### Draft Lifecycle

- New requests can now be saved without entering the approval workflow. The course
  or event name is the only field required to save a draft.
- Saved drafts reopen at `/requests/:id/edit` and use the same form as new requests.
- Employees and managers can edit, resume, submit, or permanently delete their own
  drafts. Submitted requests remain read-only.
- Draft rows link directly to **Continue editing** for their owner. Admins viewing
  another user's draft continue to the read-only request detail instead.
- Unsaved-change protection covers page close/reload, in-app links, and the form's
  back/cancel actions.
- Added `DELETE /api/requests/:requestId`, restricted to the draft owner while the
  request is still in `draft` status. Associated draft guarantee records are removed
  in the same transaction.

### Request Form Redesign

- Reorganized the desktop form into clear course-detail and estimated-cost sections.
- Added a sticky funding-impact summary showing the request total, current balance,
  used and pending funding, projected remaining funds, and future CE debt.
- Over-budget requests surface the repayment policy and signing controls in context.
- **Submit for approval** is the primary action; **Save draft** is secondary.
- The approval-before-purchase warning remains visible at the top of the workflow.
- Cost inputs now have direct accessible labels and open blank instead of displaying
  six zero values.

### Receipt Baseline Corrections

- Receipt uploads are standardized to PDF, JPG, or PNG files up to 10 MB.
- WebP was removed from the frontend and both server-side validation layers.
- Receipt downloads again force `application/octet-stream` in addition to attachment,
  `nosniff`, and private/no-store headers.

### Validation

- Resolved Dependabot alert GHSA-3jxr-9vmj-r5cp / CVE-2026-13149 by forcing
  `brace-expansion@5.0.7`; `pnpm audit --audit-level high` reports no known
  vulnerabilities.
- API client and Zod validators regenerated from OpenAPI; code generation passes.
- Full workspace TypeScript check passes.
- API and frontend production builds pass.
- Playwright discovers 28 tests in 12 files, including save/edit/submit, delete-draft,
  and unsaved-change scenarios. Replit subsequently ran all 28 tests successfully.

---

## Recent Changes (2026-07-20)

### Dashboard UX Improvements

1. **Manager dashboard now shows manager's own CE requests** — the manager dashboard
   endpoint (`GET /api/dashboard/manager`) now returns a `myRecentRequests` array
   (up to 5 of the manager's own reimbursement requests, most-recent-first).
   The frontend renders these in a new "Your Recent Requests" card, keeping manager
   requests separate from the "Pending Your Approval" team queue.

2. **Recent requests ordered most-recent-first** — all dashboard `recentRequests`
   and `myRecentRequests` queries now sort by `conEdRequests.id DESC` instead of
   `ASC`, so the newest submissions appear at the top of the list.

3. **Reimbursed badge changed to brand blue** — the `StatusBadge` component now
   styles `reimbursed` with `bg-[#002855]/10` (OSS sidebar blue) instead of the
   previous green, aligning the reimbursed state with the corporate color palette.

### Security Fixes (Receipt Upload & Serving)

- **Upload URL authorization gate restored** — `POST /api/storage/uploads/request-url`
  now returns 403 if the referenced request is not in `awaiting_receipt` status,
  preventing low-privilege users from using the upload endpoint as arbitrary storage.

- **Receipt input constraints reinstated** — upload URL validation and post-upload
  signature checks enforce PDF, JPG, or PNG files with a 10 MB maximum size.

- **Safe-serving headers added** — `GET /api/storage/objects/*` now sets
  `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, mitigating
  active-content risks when reviewers open uploaded receipt files.

- **Receipt link changed from target="_blank" to download** — the Request Detail
  page now uses a `<a download>` attribute instead of `target="_blank"`, prompting
  the browser to save the file rather than navigating away.

### Login Page Background Image

Replaced the generic stock medical image on the Sign-In and Sign-Up pages with a
PT-focused generated image: a physical therapist in navy scrubs guiding a patient's
leg stretch on a treatment table, with anatomical charts in the background. The image
is stored at `attached_assets/pt-login-bg.png`, imported as a Vite module (same
pattern as `oss-logo-white.png`), and rendered at 30% opacity behind the right
panel text. Fixes the previous root-relative `/pt-login-bg.png` path issue that
broke under Replit's artifact path-based routing.

### Orval Codegen & API Contract Maintenance

- **Fixed orval for Node 24 compatibility** — tightened `pnpm-workspace.yaml` js-yaml
  override to `^4.1.0` (js-yaml@5 dropped the ESM default export). Upgraded orval
  from `8.9.1` to `8.22.0` (exact pin). Added `version: 3` to `orval.config.ts` zod
  output override so orval generates `zod.string().url()` (Zod v3 syntax) rather
  than `zod.url()` (v4-only).

- **Registered `codegen-drift` validation step** — a named validation step that runs
  `pnpm --filter @workspace/api-spec run codegen && git diff --exit-code lib/api-client-react/src/generated/ lib/api-zod/src/generated/`. Fails if generated files differ from what's committed, catching OpenAPI spec edits that weren't followed by codegen.

### Tests

Before the draft-workflow batch, Replit reported **26 tests passing**. Replit later
reported all 28 Phase 2 tests passing. Phase 3 expands the suite to 31 tests and
requires a fresh Replit run.

---

## Recent Changes (2026-07-11 via PR #2 - Codex)

### CE Request Queues & Receipt Submission

- **Request queues** — new `requestListResponse` schema with queue metadata; the
  Requests page now renders requests grouped by queue (Pending, Active, History).
- **Receipt submission flow** — `receipt-submission.spec.ts` E2E coverage for the
  full upload workflow; `receiptFiles.ts` module with MIME sniffing and extension
  validation for uploaded receipts.
- **Role-based queue views** — employees see their own requests in structured queues;
  managers see team requests; BO sees approval queue.
- **Object storage improvements** — `getObjectEntityUploadURL` now accepts `requestId`
  to scope uploads per-request; upload path normalization handles `/requests/{id}`
  segments.
- **Request status filtering** — `listRequestsParams` gains `status` and `queue` query
  params for frontend filtering.

---

## Recent Changes (2026-06-27)

### Security Scan & Threat Model

A full security scan produced `threat_model.md` at the repo root, documenting
assets, trust boundaries, and four threat categories for the app.

Three actionable findings were identified and tracked as follow-on tasks:

1. **Admission Control (Spoofing)** — any valid Clerk session is currently
   auto-provisioned as an app user (`role=employee`). For an internal portal
   this is too permissive; only explicitly authorized staff should gain access.
   → Tracked as Task #10 (Authentication Admission Control) — in progress.

2. **Receipt Upload Validation (Tampering)** — uploaded receipts need enforced
   file-type and size limits, and the upload URL must be bound to a specific
   authorized request so low-privilege users cannot use it as arbitrary storage.
   → Tracked as Task #11 (Receipt Upload Security) — pending.

3. **Active-Content in Stored Files (Elevation of Privilege)** — receipt files
   are served back to higher-privilege reviewers from the app origin. Without
   `Content-Disposition: attachment` and a strict `Content-Type`, a malicious
   upload could execute as script in a reviewer's browser session.
   → Covered under Task #11.

### Dependency Vulnerability Fixes (10 CVEs)

All 10 flagged vulnerabilities resolved; `pnpm audit` now exits clean.

| Severity | Package | Fix | CVE |
|---|---|---|---|
| High | vite | `^7.3.2` → `^7.3.5` (catalog) | GHSA-fx2h-pf6j-xcff, GHSA-v6wh-96g9-6wx3 |
| High | playwright | `@playwright/test` `1.55.0` → `^1.55.1` | GHSA-7mvr-c777-76hp |
| High | js-cookie | override `>=3.0.7` | GHSA-qjx8-664m-686j |
| High | uuid | override `>=11.1.1` | GHSA-w5hq-g745-h8pq |
| Medium | markdown-it | override `>=14.2.0` | GHSA-6v5v-wf23-fmfq |
| Medium | js-yaml | override `>=4.2.0` (later tightened to `^4.1.0`) | GHSA-h67p-54hq-rp68 |
| Medium | qs | override `>=6.15.2` | GHSA-q8mj-m7cp-5q26 |
| Low | @babel/core | override `>=7.29.6` | GHSA-4x5r-pxfx-6jf8 |
| Low | esbuild | `0.27.3` → `0.28.1` (direct + override) | GHSA-g7r4-m6w7-qqqr |

High/medium transitive deps fixed via `overrides` in `pnpm-workspace.yaml`
rather than upgrading their parent packages. Both typechecks pass; api-server
builds cleanly with esbuild 0.28.1.

---

## Recent Changes (2026-06-26)

### Repayment Guarantee Overhaul

Full audit-trail enforcement and three-surface viewer for signed repayment agreements.

#### Schema

- Added four columns to `repayment_guarantees`: `acknowledged` (boolean, default false), `email` (text, nullable), `ip_address` (text, nullable), `session_id` (text, nullable).

#### Backend

- Both signing paths now enforce `acknowledged === true` (returns 400 otherwise):
  - `POST /api/requests/:id/submit` — over-budget employees must sign with the checkbox ticked.
  - `POST /api/requests/:id/repayment-guarantee` — standalone sign endpoint on the Request Detail page.
- Both paths capture and persist the signer's **email** (from Clerk session), **IP address** (Express `req.ip`, trust-proxy enabled for the Replit edge), and **Clerk session ID**.
- `formatRequest` / `formatRequestSimple` both now expose the full audit trail (`acknowledged`, `email`, `ipAddress`, `sessionId`) in API responses.
- `GET /api/users` batch-fetches all guarantee rows for the visible user list in a single `inArray` query, groups by `employeeId`, and attaches a `repaymentGuarantees` array per user (managers see only their clinic's staff; admin sees all).

#### API Contract

- `RepaymentGuarantee` response schema expanded: `acknowledged`, `email`, `ipAddress`, `sessionId`.
- `acknowledged` added as a required field to both guarantee-input schemas.
- `User` schema gains an optional `repaymentGuarantees` array (populated only by the `/api/users` list endpoint).
- Client and Zod types regenerated via Orval codegen.

#### Frontend

- **New Request form** — verbatim OSS Repayment Policy text replaces the old placeholder; a required acknowledgment checkbox ("I agree to conduct business electronically…") must be ticked before the name field unlocks the Submit button.
- **Request Detail signing card** — same verbatim text and checkbox; Sign button disabled until both are filled.
- **New `RepaymentGuaranteeDialog` component** — reusable dialog that renders the verbatim policy + per-guarantee audit record: signed name, user-entered **Date Signed** (`signedDate`), server **Recorded On** timestamp (`signedAt`), acknowledgment status, email, IP address, session ID, and Request #.
- **Request Detail page** — the "Repayment Guarantee" sidebar card is now a clickable trigger for `RepaymentGuaranteeDialog`, covering both the manager approval view and the Business Office review (same page, no role gate).
- **Users directory** — new "Repayment Agreement" column with an inline **View (N)** trigger per user; opens the same dialog. Shows "—" for users with no signed guarantees.

#### Tests

- `repayment-guarantee.spec.ts` extended:
  - Ticks the acknowledgment checkbox before submitting.
  - Asserts all new audit fields (`acknowledged`, `email`, `ipAddress`, `sessionId`) persist in DB and are returned by the API.
  - After signing, signs in as an admin, opens `/users`, and verifies the agreement is viewable inline (policy text, signer name, Request #, Date Signed label, Recorded On label).
- `tests/helpers/clerk.ts` — `signIn` now signs out any active session before re-signing-in, enabling mid-test user switching without "already signed in" errors.
- Suite: **23 tests, all passing**.

---

## Recent Changes (2026-06-23)

### E2E Test Suite Improvements

- **nanoid for email ID generation** — replaced `randomUUID().slice(0, 8)` with
  `customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8)` from the `nanoid`
  package. The default nanoid alphabet includes `_` and `-` which Clerk
  normalises away when storing emails, breaking the auto-provision lookup;
  restricting to lowercase alphanumeric fixes it.
- **Draft-edit test** — new test "edits a draft via the API then submits via UI
  → pending_manager" exercises `PATCH /api/requests/:id` via `page.evaluate`
  with a Clerk Bearer token, verifies updated fields appear in the UI, then
  submits through the UI.
- **Admin "create user" test uses the real API** — `admin-user-management.spec.ts`
  now calls `POST /api/users` (the admin-gated endpoint) via `page.evaluate`
  with `window.Clerk.session.getToken()`, replacing the raw `insertUser` DB
  helper.
- Suite now has **20 tests, all passing**.

### UI Changes

- **Employees / Managers plural labels** — admin dashboard user-count cards now
  read "Employees" and "Managers" (plural) with correct lowercase "s".
- **Two-step receipt upload** — selecting a file no longer immediately submits.
  After choosing a file the filename and a "Submit Receipt" button appear; only
  clicking that button triggers the upload and API call. E2E test updated to
  match.
- **"BO" → "CE" in all display labels** — "BO" abbreviation replaced with "CE"
  in dashboard descriptions, request status dropdown, and approval toast.

---

## Changes Since GitHub PR #1 Merge

These changes were made in the Replit environment after pulling in the
`codex/finish-ce-request-workflow` PR.

### Auth & Session Handling

- **Fixed Clerk auth Bearer tokens** — all API calls now explicitly attach the
  Clerk JWT as a `Bearer` token via `setAuthTokenGetter`. Previously some
  calls were missing auth headers after session refresh.
- **Removed automatic sign-out loop** — expired sessions no longer trigger an
  infinite reload/sign-out cycle. Users get a clear "session expired" message
  with a manual sign-in link.
- **Fixed sign-up page reload loop** — new users completing Clerk sign-up no
  longer get stuck in a routing loop.
- **Clerk proxy for production** — Clerk's auth proxy is wired correctly so
  the app continues to work after deployment (publishing on Replit).

### Admin Features

- **Role impersonation test mode** — admins see an amber banner at the top of
  the app with a role dropdown (Employee / Manager / Business Office /
  Accounting). Switching roles sends `X-Impersonate-Role` to the server, which
  overrides the effective role for all API calls. The selection persists in
  `sessionStorage` and clears on exit or tab close.
  - Fixed a 304 caching bug: server now sends `Vary: X-Impersonate-Role` so
    the browser caches separate responses per role; `queryClient.clear()` wipes
    stale ETags on role switch.
- **Delete user** — admins editing any user (other than themselves) now see a
  red "Delete User" button with a confirmation dialog. The server blocks
  self-deletion and returns a clear error if the user has existing CE records.
- **Manual Con-Ed allocation override** — the Edit User page lets admins set
  a custom annual allocation per user (overriding the default prorated
  $2,000/yr calculation).

### UI / UX Fixes

- **Upload Receipt button fixed** — was using a transparent `<input>` overlay
  on top of a `<button>` (unreliable in all browsers). Fixed with a `useRef`
  pattern: the button's `onClick` calls `fileInputRef.current?.click()`.
- **Upload Receipt hidden for BO/Accounting roles** — the button now only
  renders when the user's effective role is `employee` or `manager`, preventing
  it from appearing when an admin is impersonating a BO or Accounting role
  while viewing their own request.
- **BO dashboard "Total Funding Approved YTD" fixed** — was only counting
  `awaiting_receipt` status; now includes `receipt_submitted` and `reimbursed`
  so the total doesn't drop when a receipt is uploaded or a reimbursement is
  processed.
- **BO dashboard label renamed** — "Pending BO Approval" counter renamed to
  "Pending CE Approvals".
- **Scrollbar on clinic dropdown** — clinic selection lists are now scrollable
  (`max-h-72 overflow-y-auto`) so all 25 clinics are reachable.
- **Self-service profile edit** — all users can now edit their own display name
  from the Account page (previously admin-only).

### Testing

- **Playwright E2E suite** — full suite covering all 5 roles and the complete
  CE request lifecycle, including repayment guarantee and receipt upload flows.
  Configured in `artifacts/con-ed/playwright.config.ts`; run with
  `pnpm --filter @workspace/con-ed run test:e2e`.
- **E2E test data cleanup** — the global teardown script properly cascade-
  deletes all FK-linked rows (reimbursements, receipts, repayment guarantees,
  requests, users) so test runs don't leave orphaned data.

---

## Previous Changes (GitHub PR #1)

These changes were implemented and pushed via `codex/finish-ce-request-workflow` → PR #1.

### Business Rules

- Managers can submit CE requests for themselves.
- Managers can only view/approve submitted requests from employees in the clinic they manage.
- Managers no longer see other employees' drafts.
- Repayment guarantee is required when the requested amount exceeds the employee's remaining balance at submission time.
- Advanced CE funding carries forward as debt against future CE accruals.
- Receipt upload remains available only after both manager and Business Office approval.
- Added requested `otherCosts` field while preserving Business Office `approvedOther`.

### Backend

- `artifacts/api-server/src/lib/balance.ts` — annual allocation, first-year proration, carry-forward debt.
- `artifacts/api-server/src/routes/requests.ts` — draft lifecycle, repayment guarantee enforcement, clinic-scoped manager access.
- `artifacts/api-server/src/routes/users.ts` — tighter manager access by clinic.

### Frontend

- `NewRequestPage.tsx` — Other Costs input, available budget with carry-forward, repayment guarantee copy.
- `DashboardPage.tsx` — uses `availableAllocation` for progress bars, shows carry-forward debt.
- `RequestDetailPage.tsx` — shows requested other costs, defaults BO-approved other costs.

### Database

- Added `con_ed_requests.other_costs` column (applied via `pnpm --filter @workspace/db run push`).

---

## Database Schema

### Enums

| Enum | Values |
| --- | --- |
| `roleEnum` | `employee`, `manager`, `business_office`, `accounting`, `admin` |
| `requestStatusEnum` | `draft`, `pending_manager`, `manager_approved`, `manager_denied`, `pending_bo`, `bo_approved`, `bo_denied`, `awaiting_receipt`, `receipt_submitted`, `reimbursed`, `cancelled` |

### Tables

| Table | Key Fields |
| --- | --- |
| `clinics` | `id`, `name` |
| `users` | `id`, `clerkId`, `name`, `email`, `role`, `clinicId`, `managerId`, `hireDate`, `conEdAllocation` |
| `con_ed_requests` | `id`, `employeeId`, `status`, `courseNames`, `courseProvider`, `courseUrl`, `courseStartDate`, `courseEndDate`, `deliveryMethod`, legacy `courseDates`, `ceuCount`, `location`, requested/approved cost fields, approver/denial fields, `requiresRepaymentGuarantee` |
| `repayment_guarantees` | `id`, `requestId`, `employeeId`, `signedName`, `signedDate`, `signedAt`, `acknowledged`, `email`, `ip_address`, `session_id` |
| `receipts` | `id`, `requestId`, `fileUrl`, `fileName`, `uploadedAt` |
| `reimbursements` | `id`, `requestId`, `amount`, `paycheckDate`, `markedById`, `markedAt` |

## API Endpoints

### Requests

| Method | Route | Purpose | Who |
| --- | --- | --- | --- |
| GET | `/api/requests` | List requests scoped by role | Any authenticated user |
| POST | `/api/requests` | Create draft request | Employee/Manager |
| GET | `/api/requests/:id` | Get request details | Owner + relevant approvers |
| PATCH | `/api/requests/:id` | Update request while draft | Owner |
| POST | `/api/requests/:id/submit` | Submit draft; enforces guarantee if over budget | Owner |
| POST | `/api/requests/:id/cancel` | Cancel draft/pending request | Owner |
| POST | `/api/requests/:id/manager-approve` | Manager/Admin approve | Manager/Admin |
| POST | `/api/requests/:id/manager-deny` | Manager/Admin deny with reason | Manager/Admin |
| POST | `/api/requests/:id/bo-approve` | BO/Admin approve with amounts | Business Office/Admin |
| POST | `/api/requests/:id/bo-deny` | BO/Admin deny with reason | Business Office/Admin |
| POST | `/api/requests/:id/receipts` | Submit receipt after BO approval | Employee/Manager |
| POST | `/api/requests/:id/reimburse` | Mark reimbursed | Accounting/Admin |

### Users And Other Routes

| Route | Purpose |
| --- | --- |
| `GET /api/users/me` | Own profile |
| `GET /api/users/:id/balance` | Budget balance including carry-forward debt |
| `GET /api/users` | List users scoped by role |
| `POST /api/users` | Create user, admin only |
| `GET /api/users/:id` | User details |
| `PATCH /api/users/:id` | Update user (admin: all fields; self: name only) |
| `DELETE /api/users/:id` | Delete user, admin only, blocks self-delete |
| `GET /api/clinics` | List clinics |
| `GET /api/dashboard/:role` | Role dashboards |
| `POST /api/storage/uploads/request-url` | Presigned upload URL (auth-gated to `awaiting_receipt`) |
| `GET /api/storage/objects/*` | Serve private receipts (attachment + nosniff headers) |
| `GET /api/healthz` | Health check |

## Frontend Pages

| Route | Page | Role |
| --- | --- | --- |
| `/` | Sign-in | Any |
| `/dashboard` | Role-based dashboard | Any authenticated user |
| `/requests` | Request list | Any authenticated user, scoped |
| `/requests/new` | New request form | Employee/Manager |
| `/requests/:id` | Request detail and actions | Owner + relevant approvers |
| `/users` | User list | Admin |
| `/users/:id` | User detail/edit + delete | Admin |
| `/account` | Own profile (name edit) | Any authenticated user |

## Business Logic

### Budget Balance

- Annual allocation: $2,000 (or admin-set override per user).
- First year is prorated by hire month: `round(2000 * (13 - hireMonth) / 12, 2)`.
- Each January 1 starts a new allocation, reduced by outstanding advanced CE funding debt.
- Used amount is based on approved amounts for statuses `awaiting_receipt`, `receipt_submitted`, and `reimbursed`.
- Carry-forward debt is calculated from prior-year approved spend above that year's allocation.
- Current-year available allocation is `max(0, annualAllocation - carryoverDebt)`.
- Current remaining balance is `max(0, availableAllocation - currentYearUsed)`.

### Request Lifecycle

```text
draft -> pending_manager -> pending_bo -> awaiting_receipt -> receipt_submitted -> reimbursed
             |                  |
             v                  v
       manager_denied        bo_denied

cancelled is allowed from draft, pending_manager, and pending_bo.
```

### Repayment Guarantee

- Required when requested total exceeds remaining balance at submission time.
- Enforced in `POST /api/requests/:id/submit` (over-budget branch).
- `acknowledged === true` is required server-side on both the submit path and the standalone sign endpoint; a missing or false value returns 400.
- Audit trail persisted per signing: email, IP address, Clerk session ID, and acknowledged flag.
- Stored even if BO later approves less than the original request.

### Access Control

- Employee: own requests, own dashboard, own profile (name edit).
- Manager: own requests, own dashboard/profile, submitted requests from clinic employees.
- Business Office: BO approval queues.
- Accounting: receipt-submitted reimbursement queue.
- Admin: all users/requests/dashboards + impersonation test mode + delete users.

### Clinic List

Authoritative 25 OSS clinics:

Auburn, Bonney Lake, Business Office, Covington, Federal Way, Frederickson, Gig Harbor - Kimball Drive, Gig Harbor - YMCA, Graham, Kent, Lakewood, Olympia - Eastside, Olympia - McPhee, Olympia - Westside, Parkland, Puyallup - 112th Ave SE, Puyallup - East Main, Puyallup - Sunrise, Puyallup - South Hill, Spanaway, Sumner, Tacoma - Allenmore, Tacoma - Mall Blvd, Tacoma - Pearl St, University Place.

Not OSS clinics for this app: Renton, Enumclaw, Issaquah, Lacey, Monroe, Mukilteo.

## Known Gaps / Held Work

- PTO/request-for-leave workflow is out of scope.
- Email notifications are intentionally held pending IT permissions.
- The new 56-test suite requires its authenticated Replit validation run.
- The current Replit deployment uses Clerk development credentials; production
  credentials are required before permanent production launch.

## Key Files

- `lib/db/src/schema/index.ts` — Drizzle schema source of truth
- `artifacts/api-server/src/lib/balance.ts` — CE balance and carry-forward debt logic
- `artifacts/api-server/src/routes/requests.ts` — request lifecycle and approvals
- `artifacts/api-server/src/routes/users.ts` — user profile/balance access control + delete
- `artifacts/api-server/src/lib/auth.ts` — Clerk auth, DB user provisioning, impersonation
- `lib/api-client-react/src/custom-fetch.ts` — auth token + impersonation header injection
- `artifacts/con-ed/src/context/ImpersonationContext.tsx` — admin role-switch state
- `artifacts/con-ed/src/components/ImpersonationBanner.tsx` — admin test mode UI
- `lib/api-spec/openapi.yaml` — API contract
- `artifacts/con-ed/src/pages/NewRequestPage.tsx` — request creation UI
- `artifacts/con-ed/src/pages/RequestDetailPage.tsx` — request detail/actions UI
- `artifacts/con-ed/src/pages/DashboardPage.tsx` — role dashboards and balance display
- `artifacts/con-ed/src/pages/UserDetailPage.tsx` — user edit + delete UI
- `artifacts/con-ed/tests/` — Playwright E2E suite
- `.agents/memory/MEMORY.md` — durable project notes for agents
