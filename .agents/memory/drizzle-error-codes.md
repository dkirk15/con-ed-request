---
name: Drizzle wraps pg errors (SQLSTATE on err.cause.code)
description: In this repo's drizzle + node-postgres setup, DB errors are wrapped, so PG SQLSTATE codes (e.g. 23503 FK violation) are NOT on err.code — check err.cause.code, or pre-check instead.
---

# Drizzle wraps the underlying pg error

`@workspace/db` uses `drizzle-orm/node-postgres`. When a query fails, drizzle (v0.45.x)
throws a `_DrizzleQueryError` wrapper. The original `pg` error — the one carrying the
SQLSTATE `code` (e.g. `"23503"` for foreign-key violation) — sits on `err.cause`, **not**
on `err`.

So `if (err?.code === "23503")` silently never matches and the handler falls through to a
500. Check `err?.cause?.code` (keep `err?.code` too as a fallback for raw pg paths).

**Why:** A handler that mapped FK violations to a 409 returned 500 instead, because the code
was read off the wrapper rather than `err.cause`. Easy to miss since it only surfaces when a
real FK violation occurs.

**How to apply:** For "cannot delete because rows still reference it" UX, prefer a
deterministic pre-check (`SELECT count(*)` of referencing rows → return 409) over relying on
catching the FK error — it is driver/ORM-independent and gives a clean message. Keep an
`err?.code === "23503" || err?.cause?.code === "23503"` catch as a safety net. Also note
`parseInt("1abc")` returns `1`: validate numeric path params strictly (`/^[1-9]\d*$/`) before
a destructive op, or you may act on the wrong row.
