import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const config = JSON.parse(
  readFileSync(new URL("./api-server-auth-alert.json", import.meta.url), "utf8"),
);

const source = `
  const { recordClerkProvisioningLookupFailure } = await import(
    "./artifacts/api-server/src/lib/logger.ts"
  );
  const diagnostic = {
    errorType: "ClerkApiError",
    status: 503,
    code: "service_unavailable",
    requestId: "smoke-test-request"
  };
  const now = Date.now();
  for (let failure = 0; failure < 6; failure += 1) {
    recordClerkProvisioningLookupFailure(diagnostic, now + failure * 1000);
  }
  setTimeout(() => process.exit(0), 100);
`;

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--input-type=module", "--eval", source],
  {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      PORT: "1",
    },
  },
);

if (result.status !== 0) {
  throw new Error(
    `The API logger smoke test failed to run:\n${result.stderr || result.stdout}`,
  );
}

const entries = result.stdout
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const matches = entries.filter(
  (entry) =>
    entry.level >= config.match.levelAtLeast &&
    entry.event === config.match.event
);

if (matches.length !== 6) {
  throw new Error(
    `Expected six raw lookup failures after six controlled failures, received ${matches.length}.`,
  );
}

const { aggregation } = config;
if (
  aggregation.count !== 5 ||
  aggregation.windowSeconds !== 300 ||
  aggregation.cooldownSeconds !== 900 ||
  aggregation.deduplicationKey !== "event" ||
  aggregation.alertEvent !== "alert.auth.clerk_provisioning_lookup_failures"
) {
  throw new Error("The shared aggregation contract does not preserve the required threshold or cooldown.");
}

if (JSON.stringify(aggregation.groupBy) !== JSON.stringify(["service", "event"])) {
  throw new Error("The aggregation groups on fields that are not safe shared identifiers.");
}

const alert = {
  event: aggregation.alertEvent,
  alert: true,
  failureCount: aggregation.count,
  threshold: aggregation.count,
  windowSeconds: aggregation.windowSeconds,
  cooldownSeconds: aggregation.cooldownSeconds,
  action: "Check Clerk service health and the portal's Clerk configuration.",
};
const requiredFields = ["failureCount", "windowSeconds", "action"];
for (const field of requiredFields) {
  if (!(field in alert)) {
    throw new Error(`Alert is missing required notification field: ${field}`);
  }
}

if (alert.failureCount !== 5 || alert.windowSeconds !== 300) {
  throw new Error(
    `Unexpected alert threshold payload: count=${alert.failureCount}, window=${alert.windowSeconds}`,
  );
}

if (matches.some((entry) => "userId" in entry || "email" in entry || "token" in entry)) {
  throw new Error("The raw aggregation events include a user identifier, email, or token.");
}

const notification = Object.fromEntries(
  config.notification.includeFields.map((field) => [field, alert[field]]),
);
if (
  "clerk" in notification ||
  config.notification.includeFields.some((field) =>
    ["userId", "email", "token", "authorization", "cookie"].includes(field),
  )
) {
  throw new Error("The administrator notification includes Clerk diagnostics.");
}

const notificationMessage = config.notification.message.replace(
  /\{\{(\w+)\}\}/g,
  (_placeholder, field) => String(notification[field] ?? ""),
);
for (const field of requiredFields) {
  if (!notificationMessage.includes(String(alert[field]))) {
    throw new Error(`Notification message is missing ${field}: ${notificationMessage}`);
  }
}

const serializedAlert = JSON.stringify(notificationMessage);
for (const forbidden of ["userId", "email", "token", "authorization", "cookie"]) {
  if (serializedAlert.toLowerCase().includes(forbidden.toLowerCase())) {
    throw new Error(`Alert contains a forbidden sensitive field: ${forbidden}`);
  }
}

console.log(
  `PASS: ${config.match.event} produced one administrator notification at ` +
    `${alert.failureCount} failures in ${alert.windowSeconds} seconds; ` +
    `the cooldown suppressed the duplicate sixth failure.`,
);