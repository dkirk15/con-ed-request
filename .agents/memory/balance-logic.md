---
name: OSS Con-Ed balance/budget logic
description: How the $2,000/year con-ed budget is calculated for employees
---

Annual con-ed budget: $2,000/year
- Subsequent years: full $2,000 from Jan 1
- First year (hire year = current year): prorated by hire month
  Formula: allocation = Math.round(2000 × (13 - hireMonth) / 12 × 100) / 100
  where hireMonth is 1-indexed (Jan=1, Dec=12)
- "Used" = BO-approved/awaiting receipt/receipt_submitted/reimbursed amounts (totalApproved)
- "Pending" = pending_manager/manager_approved/pending_bo (totalRequested)

**Why:** Business requirement for the OSS Con-Ed portal.
**How to apply:** See artifacts/api-server/src/lib/balance.ts for implementation.
