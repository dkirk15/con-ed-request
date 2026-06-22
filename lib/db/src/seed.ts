/**
 * Seed script: 25 OSS clinic locations + initial admin user placeholder.
 * Run with: pnpm --filter @workspace/db run seed
 *
 * The script is idempotent — it will not insert duplicate clinics.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { clinics, users } from "./schema/index.js";
import { eq } from "drizzle-orm";

const CLINIC_NAMES = [
  "Auburn",
  "Bonney Lake",
  "Business Office",
  "Covington",
  "Federal Way",
  "Frederickson",
  "Gig Harbor – Kimball Drive",
  "Gig Harbor – YMCA",
  "Kent",
  "Lakewood",
  "Olympia – Eastside",
  "Olympia – McPhee",
  "Olympia – Westside",
  "Parkland",
  "Puyallup – 112th Ave SE",
  "Puyallup – East Main",
  "Puyallup – Sunrise",
  "Puyallup – South Hill",
  "Graham",
  "Spanaway",
  "Sumner",
  "Tacoma – Allenmore",
  "Tacoma – Mall Blvd",
  "Tacoma – Pearl St",
  "University Place",
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("Seeding clinics…");
  let inserted = 0;
  let skipped = 0;
  for (const name of CLINIC_NAMES) {
    const existing = await db
      .select()
      .from(clinics)
      .where(eq(clinics.name, name))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(clinics).values({ name });
      inserted++;
    } else {
      skipped++;
    }
  }
  console.log(`Clinics: ${inserted} inserted, ${skipped} already existed.`);

  const adminClerkId = process.env.ADMIN_CLERK_ID;
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@osstherapy.com";
  const adminName = process.env.ADMIN_NAME ?? "OSS Administrator";

  if (adminClerkId) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, adminClerkId))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(users).values({
        clerkId: adminClerkId,
        name: adminName,
        email: adminEmail,
        role: "admin",
      });
      console.log(`Admin user created: ${adminName} <${adminEmail}>`);
    } else {
      await db
        .update(users)
        .set({ role: "admin" })
        .where(eq(users.clerkId, adminClerkId));
      console.log(`Admin role confirmed for: ${adminClerkId}`);
    }
  } else {
    console.log(
      "Tip: Set ADMIN_CLERK_ID env var to seed the initial admin user.\n" +
        "     First user to sign in is auto-provisioned as employee;\n" +
        "     promote via PATCH /api/users/:userId.",
    );
  }

  await pool.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
