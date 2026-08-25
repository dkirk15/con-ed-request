---
name: Hire-date validation
description: Strict calendar-date policy for con-ed hire dates and safe behavior for legacy malformed values.
---

Hire dates are optional, but when supplied they must be real calendar dates in `YYYY-MM-DD` form. Reject malformed or impossible input rather than allowing date coercion to normalize it silently. If an older malformed value is encountered in calculations, treat it as an unspecified hire date: apply the full annual budget, with no proration.

**Why:** Invalid or timezone-normalized dates can produce misleading prorated funding or non-finite amounts. The fallback ensures balances and reporting remain usable while preserving a clear, safe rule.

**How to apply:** Reuse the shared hire-date parser for every allocation and carry-forward calculation. Validate raw API input before date coercion, and keep the balance endpoint and budget report on the same parser behavior.