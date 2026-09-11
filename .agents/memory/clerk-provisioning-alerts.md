---
name: Clerk provisioning alerts
description: Operational alert threshold and privacy rules for repeated Clerk user lookup failures.
---

The API emits one structured error event per failed Clerk auto-provisioning lookup. The production monitor aggregates that event across the autoscaled API service at five failures in five minutes and deduplicates administrator notifications for fifteen minutes.

**Why:** API processes can scale horizontally or restart, so an in-memory rolling counter can split or lose failures and delay an outage alert. A short burst can indicate that authorized users cannot enter the portal, but alerting on every failure would create noise.

**How to apply:** Keep the threshold and cooldown in the shared monitoring contract, not in logger process state. Grouping and administrator notification fields must not include Clerk diagnostics, user IDs, email addresses, tokens, cookies, or request headers. Provider status, error code, and request trace ID may be retained for diagnosis outside the alert aggregation.

Production log routing is external to this repository: keep the monitor contract
versioned under `deployment/monitoring/` and connect its administrator
recipient in the deployment's approved logging provider.

**Why:** The API emits structured stdout logs, but Replit deployment settings do
not provide an in-repository administrator notification destination.

**How to apply:** Validate the contract with the API monitoring smoke test after
changing the logger or the production log-monitor rule.