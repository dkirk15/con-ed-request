import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

export interface ClerkLookupDiagnostic {
  errorType: string;
  status?: number;
  code?: string;
  requestId?: string;
}

const CLERK_LOOKUP_ALERT_THRESHOLD = 5;
const CLERK_LOOKUP_ALERT_WINDOW_MS = 5 * 60 * 1000;
const CLERK_LOOKUP_ALERT_COOLDOWN_MS = 15 * 60 * 1000;

let clerkLookupFailures: number[] = [];
let lastClerkLookupAlertAt = Number.NEGATIVE_INFINITY;

export function recordClerkProvisioningLookupFailure(
  diagnostic: ClerkLookupDiagnostic,
  now = Date.now(),
): void {
  const windowStart = now - CLERK_LOOKUP_ALERT_WINDOW_MS;
  clerkLookupFailures = clerkLookupFailures.filter((timestamp) => timestamp >= windowStart);
  clerkLookupFailures.push(now);
  if (clerkLookupFailures.length > CLERK_LOOKUP_ALERT_THRESHOLD) {
    clerkLookupFailures = clerkLookupFailures.slice(-CLERK_LOOKUP_ALERT_THRESHOLD);
  }

  const failureCount = clerkLookupFailures.length;
  logger.error(
    {
      event: "auth.clerk_provisioning_lookup_failure",
      operation: "users.getUser",
      failureCount,
      windowSeconds: CLERK_LOOKUP_ALERT_WINDOW_MS / 1000,
      clerk: diagnostic,
    },
    "Clerk user lookup failed during auto-provisioning",
  );

  const cooldownElapsed = now - lastClerkLookupAlertAt >= CLERK_LOOKUP_ALERT_COOLDOWN_MS;
  if (failureCount < CLERK_LOOKUP_ALERT_THRESHOLD || !cooldownElapsed) return;

  lastClerkLookupAlertAt = now;
  logger.fatal(
    {
      event: "alert.auth.clerk_provisioning_lookup_failures",
      alert: true,
      operation: "users.getUser",
      failureCount,
      threshold: CLERK_LOOKUP_ALERT_THRESHOLD,
      windowSeconds: CLERK_LOOKUP_ALERT_WINDOW_MS / 1000,
      cooldownSeconds: CLERK_LOOKUP_ALERT_COOLDOWN_MS / 1000,
      action: "Check Clerk service health and the portal's Clerk configuration.",
      clerk: diagnostic,
    },
    "Repeated Clerk provisioning lookups are failing",
  );
}
