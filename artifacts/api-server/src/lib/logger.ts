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

export function recordClerkProvisioningLookupFailure(
  diagnostic: ClerkLookupDiagnostic,
): void {
  logger.error(
    {
      event: "auth.clerk_provisioning_lookup_failure",
      operation: "users.getUser",
      clerk: diagnostic,
    },
    "Clerk user lookup failed during auto-provisioning",
  );
}
