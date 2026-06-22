import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!user) {
    // Auto-provision a basic user record if not yet in DB
    // The admin can later assign a role/clinic
    res.status(403).json({ error: "User not provisioned. Contact your administrator." });
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
