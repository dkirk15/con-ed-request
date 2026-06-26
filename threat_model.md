# Threat Model

## Project Overview

This project is an internal continuing-education portal for Olympic Sports & Spine staff. It uses a React/Vite frontend in `artifacts/con-ed`, an Express 5 API in `artifacts/api-server`, Clerk for authentication, PostgreSQL via Drizzle for persistence, and Replit object storage for uploaded receipt files.

Production scope for this scan is the `artifacts/con-ed` frontend, the `artifacts/api-server` backend, and shared libraries under `lib/` that they execute at runtime. `artifacts/mockup-sandbox` is treated as dev-only unless a production route or build path imports it.

## Assets

- **User accounts and roles** — Clerk-authenticated identities and app-local roles (`employee`, `manager`, `business_office`, `accounting`, `admin`). Compromise changes what data and workflow actions a user can access.
- **Continuing-education request records** — funding requests, approvals, denials, reimbursement status, and workflow history. Unauthorized changes can produce fraudulent approvals or accounting confusion.
- **Receipt uploads and repayment guarantees** — uploaded files plus signed acknowledgment records, IP addresses, and session-linked audit data. These are sensitive business records and are consumed by higher-privilege reviewers.
- **Operational secrets and service trust** — Clerk secret key, database access, and object-storage signing capability. Misuse would let an attacker impersonate users or access stored business records.

## Trust Boundaries

- **Browser to API** — every client request is untrusted until the API authenticates the caller and enforces role- and record-level authorization.
- **API to Clerk** — the API trusts Clerk authentication state to identify users, but must still decide whether an authenticated principal is allowed to become an app user.
- **API to PostgreSQL** — the API has full authority over user, request, and reimbursement data. Authorization mistakes here directly expose or alter protected records.
- **API to Object Storage** — the API signs upload URLs and serves stored objects back under the application origin. Upload validation and download response headers are therefore security-critical.
- **Public vs authenticated vs privileged users** — health checks and Clerk bootstrap are public; employees are low-privilege authenticated users; managers, business office, accounting, and admins are progressively more trusted reviewers/operators.
- **Dev-only vs production** — mockup sandbox and test helpers are excluded unless imported into production builds.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/con-ed/src/App.tsx`
- **Highest-risk code areas:** `artifacts/api-server/src/lib/auth.ts`, `artifacts/api-server/src/routes/requests.ts`, `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/lib/objectStorage.ts`
- **Public surfaces:** `GET /api/healthz`, Clerk sign-in/sign-up pages, Clerk proxy path
- **Authenticated surfaces:** `/api/users/me`, `/api/requests*`, `/api/storage/uploads/request-url`, `/api/storage/objects/*`
- **Privileged surfaces:** `/api/users*`, `/api/clinics*`, manager/BO/accounting dashboard and workflow actions, admin impersonation via `X-Impersonate-Role`
- **Usually out of scope:** `artifacts/mockup-sandbox/**`, Playwright tests, seed/test utilities unless they influence production runtime behavior

## Threat Categories

### Spoofing

The application trusts Clerk for identity, then auto-provisions an app user on first authenticated API access. The required guarantee is: only identities that are explicitly authorized to join the workforce portal may be provisioned as application users. A valid Clerk session alone is not sufficient admission control for an internal business app.

### Tampering

Employees can create requests, sign guarantees, upload receipts, and drive workflow transitions that are later acted on by managers, business office staff, accounting, and admins. The API must validate request state transitions, bind uploads to an authorized business record, and reject attacker-controlled file types or metadata that could change how stored content executes when later reviewed.

### Information Disclosure

User, request, reimbursement, and receipt data are scoped by role. The API must ensure employees only see their own records, managers only see clinic-scoped data, and privileged audit metadata is exposed only when strictly necessary. Stored files served under the app origin must not leak additional data through active content.

### Denial of Service

Authenticated endpoints can mint object-storage upload URLs and trigger file uploads. The system must enforce reasonable upload size, type, count, and workflow binding limits so low-privilege users cannot turn the portal into arbitrary object storage or exhaust storage and review capacity.

### Elevation of Privilege

Receipt files are later viewed by higher-privilege staff. Because uploads are served back from the application origin, active content in stored files can become a privilege-escalation vector unless the server enforces safe content types and download headers. All privileged workflow actions must remain server-enforced and never rely on hidden frontend controls.
