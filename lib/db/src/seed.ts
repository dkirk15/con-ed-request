/**
 * Seed script: 25 OSS clinic locations + initial admin user placeholder.
 * Run with: pnpm --filter @workspace/db run seed
 *
 * The script is idempotent — it will not insert duplicate clinics.
 * The admin user record requires a Clerk ID; set ADMIN_CLERK_ID env var before running
 * or manually update the record after the first admin signs in.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { clinics, users } from "./schema/index.js";
import { eq } from "drizzle-orm";

const CLINIC_NAMES = [
  "Bellevue – Main Clinic",
  "Bellevue – Eastgate",
  "Bothell",
  "Edmonds",
  "Everett",
  "Federal Way",
  "Issaquah",
  "Kenmore",
  "Kent",
  "Kirkland",
  "Lynnwood",
  "Maple Valley",
  "Mill Creek",
  "Monroe",
  "Mountlake Terrace",
  "Mukilteo",
  "Newcastle",
  "Olympia",
  "Puyallup",
  "Redmond",
  "Renton",
  "Sammamish",
  "Seattle – Capitol Hill",
  "Seattle – Northgate",
  "Tacoma",
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("Seeding clinics…");
  let inserted = 0;
  for (const name of CLINIC_NAMES) {
    const existing = await db.select().from(clinics).where(eq(clinics.name, name)).limit(1);
    if (existing.length === 0) {
      await db.insert(clinics).values({ name });
      inserted++;
    }
  }
  console.log(`Clinics: ${inserted} inserted, ${CLINIC_NAMES.length - inserted} already existed.`);

  // Seed initial admin user if ADMIN_CLERK_ID is set
  const adminClerkId = process.env.ADMIN_CLERK_ID;
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@osstherapy.com";
  const adminName = process.env.ADMIN_NAME ?? "OSS Administrator";

  if (adminClerkId) {
    const existing = await db.select().from(users).where(eq(users.clerkId, adminClerkId)).limit(1);
    if (existing.length === 0) {
      await db.insert(users).values({
        clerkId: adminClerkId,
        name: adminName,
        email: adminEmail,
        role: "admin",
      });
      console.log(`Admin user created: ${adminName} <${adminEmail}>`);
    } else {
      // Ensure existing user has admin role
      await db.update(users).set({ role: "admin" }).where(eq(users.clerkId, adminClerkId));
      console.log(`Admin user already exists, role confirmed: ${adminClerkId}`);
    }
  } else {
    console.log(
      "Tip: Set ADMIN_CLERK_ID, ADMIN_EMAIL, ADMIN_NAME env vars to seed the initial admin user.\n" +
      "Or: The first user who signs in will be auto-provisioned with role=employee;\n" +
      "    an admin can promote them via PATCH /api/users/:userId.",
    );
  }

  await pool.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
