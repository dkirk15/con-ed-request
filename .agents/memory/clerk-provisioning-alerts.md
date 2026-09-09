---
name: Clerk provisioning alerts
description: Operational alert threshold and privacy rules for repeated Clerk user lookup failures.
---

Count Clerk auto-provisioning lookup failures in a rolling five-minute window. Emit an actionable fatal alert when the count reaches five, then suppress repeat alerts for fifteen minutes. Individual failures remain structured error events.

**Why:** A short burst can indicate that authorized users cannot enter the portal, but alerting on every failure would create noise. Authentication logs must not include Clerk user IDs, email addresses, tokens, cookies, or request headers.

**How to apply:** Keep stable event names and threshold fields so production log monitoring can route the fatal alert. Provider status, error code, and request trace ID may be retained for diagnosis, but never add user-identifying fields.