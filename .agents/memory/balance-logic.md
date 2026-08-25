---
name: OSS Con-Ed balance/budget logic
description: Proration rule for the $2,000/year con-ed budget in the first hire year
---

Annual budget: $2,000. In the hire year, budget is prorated by hire month.

Formula: `allocation = Math.round(2000 × (13 - hireMonth) / 12 × 100) / 100`
where hireMonth is 1-indexed (Jan=1, Dec=12). Subsequent years: full $2,000 from Jan 1.

Advanced CE funding carries forward as debt against future CE accruals. Example: if an
employee has $2,000 available and receives approval for a $3,000 course, the $1,000
advance reduces the following year's available balance to $1,000 instead of $2,000.

Repayment guarantees are required when the requested amount exceeds the employee's
remaining balance at submission time. The guarantee remains stored even if the
Business Office later approves an amount within the remaining balance.

**Why:** Business rule — employees hired mid-year get a partial budget proportional to months remaining.
**How to apply:** `getUserBalance()` in `artifacts/api-server/src/lib/balance.ts` is the balance entry point. It accounts for outstanding prior-year advances before reporting the current year's remaining balance. All balance-consuming statuses are derived from the DB schema status enum.

Date-only hire dates must be interpreted from their calendar year/month components rather than through UTC-sensitive `new Date("YYYY-MM-DD")` month access. Otherwise a December hire can become a November hire on servers west of UTC.

**Why:** Hire dates are calendar dates, not instants; timezone conversion can change the proration month at the year boundary.

**How to apply:** Reuse the calendar-safe hire-date parsing helper anywhere allocation or historical carry-forward logic derives a hire year or month.
