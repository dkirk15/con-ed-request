# API authentication alert

`api-server-auth-alert.json` is the production log-monitor contract for repeated
Clerk provisioning lookup failures. Configure the deployment's JSON log monitor
with this contract and route the `on-call-administrators` recipient to the
approved administrator notification channel.

The monitor must:

- match `event=alert.auth.clerk_provisioning_lookup_failures` and
  `alert=true` at fatal severity (`level >= 60`);
- send one notification when the event reaches the five-failure threshold;
- deduplicate the same event for 900 seconds (15 minutes);
- include the failure count, five-minute window, and remediation action;
- omit the nested `clerk` diagnostics and all request credentials from the
  administrator-facing message.

Run the controlled smoke test before enabling or changing the production rule:

```sh
pnpm --filter @workspace/api-server run monitoring:smoke
```

The test calls the real logger with six controlled failures. It expects one
matching notification payload from the first five failures and verifies that
the sixth failure is suppressed by the cooldown. It does not contact the
administrator channel or generate a real Clerk request.