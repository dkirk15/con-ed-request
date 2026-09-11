# API authentication alert

`api-server-auth-alert.json` is the production log-monitor contract for repeated
Clerk provisioning lookup failures. Configure the deployment's JSON log monitor
with this contract and route the `on-call-administrators` recipient to the
approved administrator notification channel.

The monitor must:

- match `event=auth.clerk_provisioning_lookup_failure` at error severity
  (`level >= 50`);
- aggregate matching events by the service and event name across all API
  instances, then send one notification at five failures in 300 seconds;
- emit the administrator alert event
  `alert.auth.clerk_provisioning_lookup_failures` and deduplicate it for 900
  seconds (15 minutes);
- include the failure count, five-minute window, and remediation action;
- omit the nested `clerk` diagnostics and all request credentials from the
  administrator-facing message.

The API deployment target is `autoscale` in `.replit`, so this aggregation must
remain in the shared monitoring platform rather than in API process memory.

Run the controlled smoke test before enabling or changing the production rule:

```sh
pnpm --filter @workspace/api-server run monitoring:smoke
```

The test calls the real logger with six controlled failures and verifies the
shared aggregation contract: the first five failures create one notification
and the sixth failure is suppressed by the cooldown. It does not contact the
administrator channel or generate a real Clerk request.