---
name: New-request funding freshness
description: Why employee request forms must fetch a fresh funding balance whenever they mount.
---

Opening the new-request form must always refetch the employee balance, rather than relying on an in-memory query result. The current balance is the repayment-guarantee threshold as well as the visible available-funding value.

**Why:** An administrator can update the annual budget in another browser session. Reusing a cached balance would show the employee outdated funding and could tell them incorrectly whether a guarantee is required.

**How to apply:** Keep a mount-time freshness policy on the new-request balance query. When changing this path, test it with separate employee and administrator sessions and preserve the employee's in-progress browser state.