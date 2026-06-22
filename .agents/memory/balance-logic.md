---
name: OSS Con-Ed balance/budget logic
description: Proration rule for the $2,000/year con-ed budget in the first hire year
---

Annual budget: $2,000. In the hire year, budget is prorated by hire month.

Formula: `allocation = Math.round(2000 × (13 - hireMonth) / 12 × 100) / 100`
where hireMonth is 1-indexed (Jan=1, Dec=12). Subsequent years: full $2,000 from Jan 1.

**Why:** Business rule — employees hired mid-year get a partial budget proportional to months remaining.
**How to apply:** `getUserBalance()` in `lib/balance.ts` implements this. All balance-consuming statuses are derived from the DB schema status enum.
