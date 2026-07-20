# OSS Continuing Education Portal

Internal workflow for Olympic Sports & Spine continuing education funding,
clinic approval, receipt submission, and reimbursement.

## Run & Operate

- pnpm --filter @workspace/api-server run dev - run the API server on port 5000
- pnpm run typecheck - full typecheck across all packages
- pnpm run build - typecheck and build all packages
- pnpm --filter @workspace/api-spec run codegen - regenerate API hooks and Zod schemas
- pnpm --filter @workspace/db run push - push DB schema changes in development
- pnpm --filter @workspace/con-ed run test:e2e - run Playwright with the app running

Required environment:

- DATABASE_URL
- CLERK_SECRET_KEY
- VITE_CLERK_PUBLISHABLE_KEY
- PRIVATE_OBJECT_DIR
- AUTHORIZED_EMAIL_DOMAINS and/or AUTHORIZED_EMAILS (comma-separated)

When no admission setting is supplied, the allowed domain defaults to
osstherapy.com.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- React, Vite, Tailwind CSS, Radix UI, wouter, React Query
- Express 5, PostgreSQL, Drizzle ORM
- Clerk authentication
- Replit object storage
- OpenAPI, Orval, and Zod

## Where Things Live

- Frontend: artifacts/con-ed/src
- API: artifacts/api-server/src
- Database schema: lib/db/src/schema/index.ts
- API contract: lib/api-spec/openapi.yaml
- Generated React client: lib/api-client-react/src/generated
- Generated Zod schemas: lib/api-zod/src/generated
- Product and handoff status: status.md
- Security model: threat_model.md

## Architecture Decisions

- Clerk proves identity; the app database owns roles and clinic authorization.
- Existing users are resolved by Clerk ID. New identities must pass the
  email/domain admission allowlist before auto-provisioning.
- Request-list state is stored in URL query parameters and executed server-side.
- Managers see their own requests plus submitted requests from their clinic.
- Receipt upload paths include the request ID and are issued only to the owner
  after final CE approval.

## Product

- Employees and managers submit and track CE funding requests.
- Managers review submitted requests from their clinic.
- Business Office sets final approved amounts.
- Employees upload receipts only after final approval.
- Accounting records reimbursement paycheck dates.
- Admins manage people, clinics, assignments, and role test mode.

## Gotchas

- The Edit User clinic selector can briefly coerce to NaN while clinics load.
  Re-selecting the clinic resolves it; this remains a known follow-up.
- Drafts are visible in My Requests, but there is not yet a draft-edit screen.
  Admin user invitation/creation is also a later-phase task.
- E2E tests use the live development database, Clerk test instance, and Replit
  object storage. Test data is namespaced and removed by global teardown.
- On Windows Node 24, Orval currently fails while importing its js-yaml
  dependency. Run API codegen in Replit before deployment.
