# OSS Con-Ed Portal — Status Report

## Project Overview
Continuing Education request management web app for **Olympic Sports & Spine** (OSS). Employees submit requests for courses/CEUs; managers and business office approve; accounting reimburses. Annual budget ($2,000/year, prorated first year) tracked per employee.

## Architecture
- **Monorepo**: `pnpm` workspaces with `artifacts/` (deployable) and `lib/` (shared packages)
- **Frontend**: `artifacts/con-ed` — React + Vite + Tailwind CSS + Radix UI (shadcn/ui pattern) + wouter (routing)
- **Backend**: `artifacts/api-server` — Express + esbuild + Drizzle ORM + PostgreSQL + Clerk auth + Google Cloud Storage
- **API Spec**: `lib/api-spec` — OpenAPI 3.1 + Orval codegen for `lib/api-zod` (types) and `lib/api-client-react` (React Query hooks)
- **Database**: `lib/db` — Drizzle ORM schema, migrations, seeding
- **Object Storage**: Receipts stored via Google Cloud Storage (presigned uploads, private serving)
- **Auth**: Microsoft 365 SSO via Clerk (Replit-managed tenant); `@clerk/clerk-react` on frontend, `@clerk/express` on backend
- **TypeScript**: Full typecheck passing on both frontend and backend (`tsc --noEmit` clean)
- **OpenAPI**: All major endpoints documented in `lib/api-spec/openapi.yaml`

## Database Schema

### Enums
| Enum | Values |
|------|--------|
| `roleEnum` | `employee`, `manager`, `business_office`, `accounting`, `admin` |
| `requestStatusEnum` | `draft`, `pending_manager`, `manager_approved`, `manager_denied`, `pending_bo`, `bo_approved`, `bo_denied`, `awaiting_receipt`, `receipt_submitted`, `reimbursed`, `cancelled` |

### Tables
| Table | Key Fields |
|-------|-----------|
| `clinics` | `id` (serial PK), `name` (text) |
| `users` | `id` (serial PK), `clerkId` (text, unique), `name`, `email`, `role`, `clinicId` (FK), `managerId`, `hireDate` (date) |
| `con_ed_requests` | `id` (serial PK), `employeeId` (FK), `status`, `courseNames`, `courseDates`, `ceuCount`, `location`, `tuition`, `lodging`, `airfare`, `rentalCar`, `parking`, `otherCosts`, `totalRequested`, `approvedTuition`, `approvedLodging`, `approvedAirfare`, `approvedRentalCar`, `approvedParking`, `approvedOther`, `totalApproved`, `managerId`, `managerApprovedAt`, `managerDeniedAt`, `managerDenialReason`, `boApproverId`, `boApprovedAt`, `boDeniedAt`, `boDenialReason`, `requiresRepaymentGuarantee` (boolean) |
| `repayment_guarantees` | `id` (serial PK), `requestId` (FK), `employeeId` (FK), `signedName`, `signedDate`, `signedAt` |
| `receipts` | `id` (serial PK), `requestId` (FK), `fileUrl`, `fileName`, `uploadedAt` |
| `reimbursements` | `id` (serial PK), `requestId` (FK), `paycheckDate` (date), `markedById` (FK), `markedAt` |

## API Endpoints

### Requests (`/api/requests`)
| Method | Route | Purpose | Who |
|--------|-------|---------|-----|
| GET | `/api/requests` | List requests (scoped by role) | Any |
| POST | `/api/requests` | Create draft request | Employee/Manager |
| GET | `/api/requests/:id` | Get request details | Owner + relevant approvers |
| PATCH | `/api/requests/:id` | Update request (only while draft) | Owner |
| POST | `/api/requests/:id/submit` | Submit draft for approval (enforces repayment guarantee if over budget) | Owner |
| POST | `/api/requests/:id/cancel` | Cancel request (draft, pending_manager, pending_bo) | Owner |
| POST | `/api/requests/:id/manager-approve` | Manager/Admin approve | Manager/Admin |
| POST | `/api/requests/:id/manager-deny` | Manager/Admin deny + reason | Manager/Admin |
| POST | `/api/requests/:id/bo-approve` | BO/Admin approve + set amounts | BO/Admin |
| POST | `/api/requests/:id/bo-deny` | BO/Admin deny + reason | BO/Admin |
| POST | `/api/requests/:id/receipts` | Submit receipt | Employee |
| POST | `/api/requests/:id/reimburse` | Mark as reimbursed | Accounting/Admin |

### Users (`/api/users`)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/users/me` | Own profile |
| GET | `/api/users/:id/balance` | Budget balance (total, used, remaining) |
| GET | `/api/users` | List users (scoped by role) |
| POST | `/api/users` | Create user (Admin only) |
| GET | `/api/users/:id` | User details |
| PATCH | `/api/users/:id` | Update user (Admin only) |

### Other
| Route | Purpose |
|-------|---------|
| `GET /api/clinics` | List all clinics |
| `GET /api/dashboard/:role` | Dashboard summaries per role |
| `POST /api/storage/uploads/request-url` | Presigned upload URL |
| `GET /api/storage/objects/*` | Serve private receipts |
| `GET /api/healthz` | Health check |

## Frontend Pages
| Route | Page | Role |
|-------|------|------|
| `/` | Sign-in (Clerk redirect) | Any |
| `/dashboard` | Role-based dashboard | Any |
| `/requests` | Request list (scoped) | Any |
| `/requests/new` | New request form | Employee/Manager |
| `/requests/:id` | Request detail (with actions) | Any |
| `/users` | User list (Admin only) | Admin |
| `/users/:id` | User detail + balance | Admin |
| `/account` | Own profile | Any |

## Business Logic

### Budget Balance
- Annual allocation: **$2,000**
- **First year**: prorated by hire month: `round(2000 * (13 - hireMonth) / 12, 2)`
- **Reset**: January 1 each year, reduced by any outstanding advanced CE funding debt from prior years
- **Used**: calculated from approved amounts (not requested amounts) on BO-approved requests in statuses: `awaiting_receipt`, `receipt_submitted`, `reimbursed`
- **Pending**: calculated separately from requested amounts on requests still in the manager/BO approval pipeline
- **Advanced CE debt**: approved funding above the employee's remaining balance carries forward against future CE accruals; e.g. a $3,000 approved course against a $2,000 balance leaves $1,000 available the following year. Implemented in `artifacts/api-server/src/lib/balance.ts`.

### Request Status Lifecycle
```
draft → pending_manager → pending_bo → awaiting_receipt → receipt_submitted → reimbursed
                          ↓           ↓
                    manager_denied  bo_denied
                    cancelled
```
- **draft**: Created by employee. Employee sees, others don't. Employee can submit (with guarantee if over budget), cancel, or edit.
- **pending_manager**: Submitted. Manager sees + can approve/deny. Manager's clinic scope enforced.
- **pending_bo**: Manager approved. BO sees + can approve/deny with amounts.
- **awaiting_receipt**: BO approved. Employee uploads receipt (moves to `receipt_submitted`). The UI should make clear that employees should wait for manager and BO approval before purchasing/registering.
- **receipt_submitted**: Accounting sees + reimburses.
- **reimbursed**: Accounting marked paycheck date.

### Repayment Guarantee
- When a request exceeds remaining budget, `requiresRepaymentGuarantee` is set on the request
- **Enforced at `POST /api/requests/:id/submit`** (not at manager approval)
- Employee must sign digitally with name + date before submission
- After submission, the guarantee record is stored even if the Business Office later approves an amount within the employee's remaining balance

### Access Control
- **Employee**: See own requests, own dashboard
- **Manager**: See/approve `pending_manager` requests from employees in the clinic they manage (null clinicId returns empty list, not all users); managers can also submit their own CE requests
- **Business Office**: See all requests pending BO approval + awaiting receipt
- **Accounting**: See `receipt_submitted` + reimbursement actions
- **Admin**: See all users, all requests, all dashboards

### Clinic List (25 seeded)
Auburn, Bonney Lake, Business Office, Covington, Federal Way, Frederickson, Gig Harbor – Kimball Drive, Gig Harbor – YMCA, Graham, Kent, Lakewood, Olympia – Eastside, Olympia – McPhee, Olympia – Westside, Parkland, Puyallup – 112th Ave SE, Puyallup – East Main, Puyallup – Sunrise, Puyallup – South Hill, Spanaway, Sumner, Tacoma – Allenmore, Tacoma – Mall Blvd, Tacoma – Pearl St, University Place

## Authentication
- **Microsoft 365 SSO** via Clerk (Replit-managed tenant)
- Frontend: `ClerkProvider` with `VITE_CLERK_PUBLISHABLE_KEY`
- Backend: `ClerkExpressWithAuth` middleware, `requireAuth` middleware, `req.dbUser` populated via Clerk session
- Clerk SSO button configured for `microsoft` OAuth provider

## Quality / Status
- **TypeScript**: `tsc --noEmit` clean on both `@workspace/api-server` and `@workspace/con-ed`
- **API server**: builds via `esbuild` (esbuild ignores type errors, but `typecheck` passes)
- **Frontend**: `vite` dev server and `build` both work
- **OpenAPI**: All major endpoints documented; generated clients (`api-zod` + `api-client-react`) are rebuilt and type-safe
- **DB**: `drizzle-kit` push applied; 25 clinics seeded; `requestStatusEnum` includes `draft`

## Known Gaps / Cancelled Work
These were proposed as follow-up tasks but were cancelled:

1. **M365 Provisioning UI** — Enable admin to invite/provision staff directly from inside the portal. Currently users sign up via Clerk SSO and appear in DB after first login.
2. **Admin User Management** — Full CRUD for staff accounts (clinic assignment, role changes, manager linking) inside the portal. Currently only basic create/update in `/users`.
3. **Email Notifications** — Notify employees/managers when requests are approved, denied, or need action. Currently no notification system.

## Clarified Requirements / Implementation Notes
- **Requested other costs**: Implemented as `otherCosts` on requests. Business Office still has a separate `approvedOther` amount.
- **Database push needed**: Deployments need `pnpm --filter @workspace/db run push` (or the equivalent Replit DB schema push) so `con_ed_requests.other_costs` exists.
- **Purchase-before-approval guidance**: New request UI tells employees to wait for manager and BO approval before registering/purchasing. Receipt upload is restricted to BO-approved requests.
- **PTO**: Out of scope for this portal.

## Files to Know
- `lib/db/src/schema/index.ts` — Drizzle schema (source of truth)
- `lib/db/src/seed.ts` + `seed.mjs` — Clinic seeding
- `artifacts/api-server/src/routes/requests.ts` — Request lifecycle endpoints
- `artifacts/api-server/src/routes/users.ts` — User management + balance logic
- `artifacts/api-server/src/lib/auth.ts` — Clerk middleware + user sync
- `lib/api-spec/openapi.yaml` — API contract
- `artifacts/con-ed/src/pages/NewRequestPage.tsx` — Frontend request creation
- `artifacts/con-ed/src/pages/RequestDetailPage.tsx` — Request detail + actions
- `artifacts/con-ed/src/pages/DashboardPage.tsx` — Role-based dashboard

## Agents Memory
See `.agents/memory/MEMORY.md` for durable notes on:
- Request lifecycle rules (`oss-request-lifecycle.md`)
- Authoritative clinic list (`oss-clinics.md`)
- Budget proration logic (`balance-logic.md`)
