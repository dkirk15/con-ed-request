import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createClerkClient } from "@clerk/backend";
import { logger } from "./logger";
const clerkSdk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const DEFAULT_AUTHORIZED_DOMAINS = ["osstherapy.com"];

class AdmissionDeniedError extends Error {
  constructor() {
    super("This account is not authorized to use the CE portal.");
    this.name = "AdmissionDeniedError";
  }
}

export type Role =
  | "employee"
  | "manager"
  | "business_office"
  | "accounting"
  | "admin";

declare global {
  namespace Express {
    interface Request {
      dbUser?: typeof users.$inferSelect;
    }
  }
}

function getClerkLookupDiagnostic(error: unknown): {
  errorType: string;
  status?: number;
  code?: string;
  requestId?: string;
} {
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    clerkTraceId?: unknown;
    requestId?: unknown;
  };

  return {
    errorType: error instanceof Error ? error.name : typeof error,
    ...(typeof candidate.status === "number" ? { status: candidate.status } : {}),
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.clerkTraceId === "string"
      ? { requestId: candidate.clerkTraceId }
      : typeof candidate.requestId === "string"
        ? { requestId: candidate.requestId }
        : {}),
  };
}

async function resolveOrProvisionUser(clerkId: string): Promise<typeof users.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (existing) return existing;

  // New users must pass the workforce allowlist before they are provisioned.
  let clerkUser;
  try {
    clerkUser = await clerkSdk.users.getUser(clerkId);
  } catch (error) {
    logger.error(
      {
        clerkId,
        operation: "users.getUser",
        clerk: getClerkLookupDiagnostic(error),
      },
      "Clerk user lookup failed during auto-provisioning",
    );
    return null;
  }

  const email = clerkUser.emailAddresses?.find(
    (candidate) => candidate.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress;

  if (!email || !isAuthorizedEmail(email)) {
    throw new AdmissionDeniedError();
  }

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email;

  try {
    const [created] = await db
      .insert(users)
      .values({ clerkId, name, email, role: "employee" })
      .returning();
    return created;
  } catch {
    return null;
  }
}

function splitSetting(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAuthorizedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const exactEmails = new Set(splitSetting(process.env.AUTHORIZED_EMAILS));
  const configuredDomains = splitSetting(process.env.AUTHORIZED_EMAIL_DOMAINS)
    .map((domain) => domain.replace(/^@/, ""));
  const hasAnyConfig = exactEmails.size > 0 || configuredDomains.length > 0;
  const allowedDomains = new Set(
    configuredDomains.length > 0 ? configuredDomains
      : hasAnyConfig ? []
        : DEFAULT_AUTHORIZED_DOMAINS,
  );
  const domain = normalized.split("@")[1];

  return exactEmails.has(normalized) || Boolean(domain && allowedDomains.has(domain));
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let user: typeof users.$inferSelect | null;
  try {
    user = await resolveOrProvisionUser(clerkId);
  } catch (error) {
    if (error instanceof AdmissionDeniedError) {
      res.status(403).json({
        error: "This account is not authorized for the CE portal. Contact an administrator.",
      });
      return;
    }
    throw error;
  }
  if (!user) {
    res.status(403).json({ error: "Unable to provision user. Contact your administrator." });
    return;
  }

  // Admin impersonation: honour X-Impersonate-Role for admins only
  if (user.role === "admin") {
    const requested = req.headers["x-impersonate-role"] as string | undefined;
    const validRoles = ["employee", "manager", "business_office", "accounting", "admin"];
    if (requested && validRoles.includes(requested)) {
      req.dbUser = { ...user, role: requested as typeof user.role };
      next();
      return;
    }
  }

  req.dbUser = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireAuth(req, res, async () => {
      if (!req.dbUser || !roles.includes(req.dbUser.role as Role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    });
  };
}
