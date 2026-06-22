# OSS Con-Ed Portal - Status Report

Last updated: 2026-06-22 by Codex

## Current GitHub Handoff

- Working branch: `codex/finish-ce-request-workflow`
- Draft PR: https://github.com/dkirk15/con-ed-request/pull/1
- Latest functional commit: `9abc9c1 finish CE request workflow rules`
- Purpose of the PR: finish the clarified CE request business rules, replace the source PDFs, and prepare the app to return to Replit for final database push/testing/deployment.

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

## Latest Codex Changes

These changes were implemented and pushed in PR #1.

### Business Rules

- Replaced the incorrect Renton clinic with Graham in project memory/docs.
- Managers can submit CE requests for themselves.
- Managers can only view/approve submitted requests from employees in the clinic they manage.
- Managers no longer see other employees' drafts.
- Managers with no `clinicId` do not accidentally gain access to employees with `clinicId = null`.
- Repayment guarantee is required when the requested amount exceeds the employee's remaining balance at submission time.
- The repayment guarantee stays stored even if the Business Office later approves an amount within the remaining balance.
- Advanced CE funding carries forward as debt against future CE accruals.
- Receipt upload remains available only after both manager and Business Office approval.
- PTO/request-for-leave tracking is intentionally out of scope.
- Course details remain free text.
- Added requested `otherCosts` field while preserving Business Office `approvedOther`.

### Backend

- `artifacts/api-server/src/lib/balance.ts`
  - Implements annual allocation, first-year proration, current-year used amount, pending amount, and carry-forward debt.
  - Approved spend in excess of a prior year's allocation reduces the next year's available allocation.
  - Example: a $3,000 approved course against a $2,000 benefit leaves $1,000 available the following year.
- `artifacts/api-server/src/routes/requests.ts`
  - Creates requests as drafts for employees and managers.
  - Allows editing only while a request is `draft`.
  - Rechecks repayment guarantee requirement at submit time using the latest balance.
  - Scopes manager request lists/approvals by clinic.
  - Allows managers to view their own requests and receipts.
  - Includes `otherCosts` in create/update/format paths.
- `artifacts/api-server/src/routes/users.ts`
  - Tightens manager access to user profiles and balances by clinic, while still allowing managers to view their own record.
- `artifacts/api-server/src/routes/requestHelpers.ts`
  - Includes `otherCosts` in simplified request formatting.

### Frontend

- `artifacts/con-ed/src/pages/NewRequestPage.tsx`
  - Adds an `Other Costs` input.
  - Includes `otherCosts` in total requested.
  - Shows available budget after carry-forward debt.
  - Shows carry-forward debt when present.
  - Adds an approval warning telling users not to register/pay/book travel until manager and Business Office approval.
  - Updates repayment guarantee copy to match the advanced-funding policy.
- `artifacts/con-ed/src/pages/DashboardPage.tsx`
  - Uses `availableAllocation` instead of raw annual allocation for progress bars.
  - Shows carry-forward advance/debt when present.
- `artifacts/con-ed/src/pages/RequestDetailPage.tsx`
  - Shows requested other costs.
  - Defaults BO-approved other costs from requested other costs when approving.

### API Contract And Generated Clients

- `lib/api-spec/openapi.yaml`
  - `ConEdRequest.status` includes `draft`.
  - `POST /requests` is documented as draft creation.
  - `POST /requests/{requestId}/submit` has typed `SubmitRequestInput`.
  - `BalanceInfo` includes `availableAllocation` and `carryoverDebt`.
  - Request create/update/response schemas include `otherCosts`.
  - Repayment guarantee schemas include nullable `signedDate`.
- Regenerated API outputs in:
  - `lib/api-client-react/src/generated/*`
  - `lib/api-zod/src/generated/*`
- `lib/api-zod/src/index.ts`
  - Uses `export type * from "./generated/types"` to avoid type/value export collisions.

### Database

- `lib/db/src/schema/index.ts`
  - Adds `con_ed_requests.other_costs`.

Important: the schema change has been committed, but the Replit database still needs to be updated with Drizzle before runtime testing/deployment.

### PDF Assets

- Replaced corrupted/old CE request source PDF:
  - `attached_assets/Continuing_Education_Request_1782093775760.pdf`
- Added repayment guarantee source PDF:
  - `attached_assets/Guarantee of Repayment of Advanced Continuing Education Funds.pdf`

### Documentation/Memory

- Updated:
  - `.agents/memory/balance-logic.md`
  - `.agents/memory/oss-clinics.md`
  - `.agents/memory/oss-request-lifecycle.md`
  - `status.md`

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
| `users` | `id`, `clerkId`, `name`, `email`, `role`, `clinicId`, `managerId`, `hireDate` |
| `con_ed_requests` | `id`, `employeeId`, `status`, `courseNames`, `courseDates`, `ceuCount`, `location`, `tuition`, `lodging`, `airfare`, `rentalCar`, `parking`, `otherCosts`, `totalRequested`, approved amount fields, approver/denial fields, `requiresRepaymentGuarantee` |
| `repayment_guarantees` | `id`, `requestId`, `employeeId`, `signedName`, `signedDate`, `signedAt` |
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
| POST | `/api/requests/:id/submit` | Submit draft for manager approval; enforces guarantee if over budget | Owner |
| POST | `/api/requests/:id/cancel` | Cancel draft/pending request | Owner |
| POST | `/api/requests/:id/manager-approve` | Manager/Admin approve | Manager/Admin |
| POST | `/api/requests/:id/manager-deny` | Manager/Admin deny with reason | Manager/Admin |
| POST | `/api/requests/:id/bo-approve` | Business Office/Admin approve with amounts | Business Office/Admin |
| POST | `/api/requests/:id/bo-deny` | Business Office/Admin deny with reason | Business Office/Admin |
| POST | `/api/requests/:id/receipts` | Submit receipt after BO approval | Employee |
| POST | `/api/requests/:id/reimburse` | Mark reimbursed | Accounting/Admin |

### Users And Other Routes

| Route | Purpose |
| --- | --- |
| `GET /api/users/me` | Own profile |
| `GET /api/users/:id/balance` | Budget balance including carry-forward debt |
| `GET /api/users` | List users scoped by role |
| `POST /api/users` | Create user, admin only |
| `GET /api/users/:id` | User details |
| `PATCH /api/users/:id` | Update user, admin only |
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
| `/users/:id` | User detail and balance | Admin |
| `/account` | Own profile | Any authenticated user |

## Business Logic

### Budget Balance

- Annual allocation: $2,000.
- First year is prorated by hire month: `round(2000 * (13 - hireMonth) / 12, 2)`.
- Each January 1 starts a new allocation, reduced by outstanding advanced CE funding debt.
- Used amount is based on approved amounts for statuses `awaiting_receipt`, `receipt_submitted`, and `reimbursed`.
- Pending amount is calculated separately from requests in the manager/BO approval pipeline.
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

- `draft`: owner can edit, cancel, or submit; not visible to managers unless it is the manager's own request.
- `pending_manager`: visible to the manager of the employee's clinic; manager can approve/deny.
- `pending_bo`: visible to Business Office; BO can approve/deny and set approved amounts.
- `awaiting_receipt`: both manager and BO approval are complete; employee can upload receipt.
- `receipt_submitted`: visible to Accounting for reimbursement.
- `reimbursed`: Accounting has marked a paycheck date.

### Repayment Guarantee

- Required when requested total exceeds the employee's remaining balance at submission time.
- Enforced in `POST /api/requests/:id/submit`.
- Requires signed name and signed date.
- Stored in `repayment_guarantees`.
- Remains stored even if BO later approves less than the original request.

### Access Control

- Employee: own requests, own dashboard, own profile.
- Manager: own requests, own dashboard/profile, and submitted requests from employees in the manager's clinic.
- Business Office: BO approval queues and awaiting receipt visibility.
- Accounting: receipt-submitted reimbursement queue and reimbursement action.
- Admin: all users, requests, dashboards, and approval actions.

### Clinic List

Authoritative 25 OSS clinics:

Auburn, Bonney Lake, Business Office, Covington, Federal Way, Frederickson, Gig Harbor - Kimball Drive, Gig Harbor - YMCA, Graham, Kent, Lakewood, Olympia - Eastside, Olympia - McPhee, Olympia - Westside, Parkland, Puyallup - 112th Ave SE, Puyallup - East Main, Puyallup - Sunrise, Puyallup - South Hill, Spanaway, Sumner, Tacoma - Allenmore, Tacoma - Mall Blvd, Tacoma - Pearl St, University Place.

Not OSS clinics for this app: Renton, Enumclaw, Issaquah, Lacey, Monroe, Mukilteo.

## Replit Agent Next Steps

After pulling PR #1 back into Replit:

1. Run install/build/typecheck if dependencies changed or if Replit requests it.
2. Apply the DB schema update:
   ```sh
   pnpm --filter @workspace/db run push
   ```
3. Seed clinics/users if needed:
   ```sh
   pnpm --filter @workspace/db run seed
   ```
4. Verify `con_ed_requests.other_costs` exists before testing new requests.
5. Test as:
   - employee creating/editing/submitting draft requests
   - manager submitting their own request
   - manager approving only same-clinic submitted employee requests
   - Business Office approving with requested/approved other costs
   - receipt upload only after BO approval
   - carry-forward debt display on dashboard/new request page
6. Confirm Clerk env vars and database env vars are still present in Replit secrets:
   - `DATABASE_URL`
   - `CLERK_SECRET_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - optional `ADMIN_CLERK_ID`

## Validation Already Run Locally

- `git diff --cached --check`
- `tsc --build`
- API server production bundle: `node ./build.mjs` from `artifacts/api-server`
- Frontend production build: `vite build --config vite.config.ts` from `artifacts/con-ed`

The Vite build completed successfully. It printed existing sourcemap warnings for several UI components, but those warnings did not fail the build.

## Known Gaps / Held Work

- PTO/request-for-leave workflow is out of scope.
- Admin provisioning/invite UI is not implemented.
- Email notifications are not implemented.
- Replit production deployment still needs final DB schema push and end-to-end testing.

## Files To Know

- `lib/db/src/schema/index.ts` - Drizzle schema source of truth
- `lib/db/src/seed.ts` and `lib/db/seed.mjs` - clinic/user seeding
- `artifacts/api-server/src/lib/balance.ts` - CE balance and carry-forward debt logic
- `artifacts/api-server/src/routes/requests.ts` - request lifecycle and approvals
- `artifacts/api-server/src/routes/users.ts` - user profile/balance access control
- `artifacts/api-server/src/lib/auth.ts` - Clerk auth and DB user provisioning
- `lib/api-spec/openapi.yaml` - API contract
- `lib/api-client-react/src/generated/*` - generated frontend client/hooks
- `lib/api-zod/src/generated/*` - generated Zod schemas/types
- `artifacts/con-ed/src/pages/NewRequestPage.tsx` - request creation UI
- `artifacts/con-ed/src/pages/RequestDetailPage.tsx` - request detail/actions UI
- `artifacts/con-ed/src/pages/DashboardPage.tsx` - role dashboards and balance display
- `.agents/memory/MEMORY.md` - durable project notes for agents
