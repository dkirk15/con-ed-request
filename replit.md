# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/con-ed run test:e2e` — Playwright E2E suite (web app must be running)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Edit User clinic Select coerces to NaN**: On the Edit User page (`/users/:id`), the Clinic Assignment `<Select>` validates with `z.coerce.number()`. When a user already has a clinic and the clinics list is still loading on first render, the field's value can resolve to `NaN`, producing an "Expected number, received nan" validation error that silently blocks Save (no request is sent). Editing a user who has no clinic, or re-selecting the clinic after the list loads, works fine.
- **No draft-edit or create-user UI**: New requests are created as `draft` then immediately submitted to `pending_manager` in one action on the New Request page — there is no UI to edit a draft before submitting. Users cannot be created from the UI (only edited at `/users/:id`); new accounts are auto-provisioned as `employee` on first authenticated request and then promoted via the Edit User page.
- **E2E tests run against the live dev DB/Clerk**: The Playwright suite (`artifacts/con-ed/tests/`) talks to the running web + API workflows, the real Postgres, and the Replit-managed Clerk dev instance. Test data is namespaced (`e2e.%+clerk_test@example.com` users, `E2E-%` clinics) and removed by the global teardown. The full suite takes ~4+ minutes; run subsets during development.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
