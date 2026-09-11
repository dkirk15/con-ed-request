---
name: OpenAPI date query validation
description: How to validate calendar dates without breaking Express query-string parsing in Orval-generated Zod schemas.
---

Keep query-string dates as OpenAPI strings with a YYYY-MM-DD pattern and document that they must be valid calendar dates. Apply strict calendar validation after the generated schema parses the query.

**Why:** Orval maps OpenAPI `format: date` to `zod.date()` rather than a coercing string validator. Express supplies query parameters as strings, so valid dates are rejected before route logic runs.

**How to apply:** For date query parameters consumed from `req.query`, do not switch to `format: date` unless the generator is configured to coerce strings. Preserve generated string parsing and add a shared server refinement for calendar validity.