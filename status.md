# OSS Con-Ed Portal - Status Report

Last updated: 2026-06-26 by Replit Agent

## Current State

All development is on the `main` branch in Replit. The GitHub repo at
`https://github.com/dkirk15/con-ed-request` is kept as a backup.

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
| `con_ed_requests` | `id`, `employeeId`, `status`, `courseNames`, `courseDates`, `ceuCount`, `location`, `tuition`, `lodging`, `airfare`, `rentalCar`, `parking`, `otherCosts`, `totalRequested`, approved amount fields, approver/denial fields, `requiresRepaymentGuarantee` |
| `repayment_guarantees` | `id`, `requestId`, `employeeId`, `signedName`, `signedDate`, `signedAt`, `acknowledged`, `email`, `ip_address`, `session_id` |
| `receipts` | `id`, `requestId`, `fileUrl`, `fileName`, `uploadedAt` |
| `reimbursements` | `id`, `requestId`, `paycheckDate`, `markedById`, `markedAt` |

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
| `POST /api/storage/uploads/request-url` | Presigned upload URL |
| `GET /api/storage/objects/*` | Serve private receipts |
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
- Email notifications are not implemented.

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
