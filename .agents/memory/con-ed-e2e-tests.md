---
name: con-ed E2E test suite
description: Non-obvious constraints for running and writing the Playwright E2E suite (artifacts/con-ed/tests)
---

# Running the suite
- Run Playwright **synchronously inside a single bash call** (`playwright test … > file 2>&1; cat file`). Launching with `&` and polling across separate tool calls causes the background process to be **orphaned/reaped** between calls — it dies producing zero output.
- The full suite exceeds the 120s bash-tool limit. Run in **batches of a few specs** per call (each batch finishes <120s), not all at once.
- After a reaped/killed run, leftover Chromium can spike memory and cause transient SIGKILL (exit 137) on the *next* commands. If you see 137 with no output, check `free -m`; it usually clears once dying browsers are reaped, then retry.
- Avoid piping playwright output through `tail` — on a SIGKILL the pipe yields no output. Redirect to a file and `cat` it after.

# Writing assertions
- **Status labels collide**: a status like "Reimbursed" / "Manager Denied" renders BOTH in the header `StatusBadge` AND in an `<h4>` history/denial-reason element → `getByText(label)` is a strict-mode violation. Scope to the header: `page.getByRole("heading", { name: /Request #\d+/ }).getByText(label)`.
- **Cost inputs aren't reachable by label**: cost fields wrap `<input>` in a `<div className="relative">` for the "$" prefix, so shadcn `FormControl` puts the `id` on the div, not the input → `getByLabel(...)` fails. Target by attribute: cost inputs use `step="0.01"`, ceuCount uses `step="0.5"`.

**Why:** These cost real debugging time; the collisions/wrappers are invisible from the page's visual output.
**How to apply:** When adding/maintaining con-ed E2E tests or debugging "strict mode violation"/"getByLabel timeout" failures.
