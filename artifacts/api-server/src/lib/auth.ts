import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createClerkClient } from "@clerk/clerk-sdk-node";
const clerkSdk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

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

async function resolveOrProvisionUser(clerkId: string): Promise<typeof users.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (existing) return existing;

  // Auto-provision: fetch name/email from Clerk and create a record with role=employee
  try {
    const clerkUser = await clerkSdk.users.getUser(clerkId);
    const email =
      clerkUser.emailAddresses?.[0]?.emailAddress ?? `${clerkId}@unknown.invalid`;
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email;

    const [created] = await db
      .insert(users)
      .values({ clerkId, name, email, role: "employee" })
      .returning();
    return created;
  } catch {
    return null;
  }
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

  const user = await resolveOrProvisionUser(clerkId);
  if (!user) {
    res.status(403).json({ error: "Unable to provision user. Contact your administrator." });
    return;
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
