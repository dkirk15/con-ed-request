/**
 * Seed script: 25 OSS clinic locations (idempotent).
 * Run with: node lib/db/seed.mjs
 */
import pg from "pg";

const { Pool } = pg;

const CLINIC_NAMES = [
  "Auburn",
  "Bonney Lake",
  "Business Office",
  "Covington",
  "Enumclaw",
  "Federal Way",
  "Gig Harbor – Kimball Drive",
  "Gig Harbor – YMCA",
  "Graham",
  "Issaquah",
  "Kent",
  "Lacey",
  "Lakewood",
  "Monroe",
  "Mountlake Terrace",
  "Mukilteo",
  "Olympia – Eastside",
  "Olympia – McPhee",
  "Olympia – Westside",
  "Port Orchard",
  "Puyallup",
  "Renton",
  "Tacoma – Allenmore",
  "Tacoma – Mall Blvd",
  "Tacoma – Pearl St",
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  console.log("Seeding clinics…");
  let inserted = 0;
  let skipped = 0;
  for (const name of CLINIC_NAMES) {
    const { rows } = await pool.query(
      "SELECT id FROM clinics WHERE name = $1 LIMIT 1",
      [name],
    );
    if (rows.length === 0) {
      await pool.query("INSERT INTO clinics (name) VALUES ($1)", [name]);
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
    const { rows } = await pool.query(
      "SELECT id FROM users WHERE clerk_id = $1 LIMIT 1",
      [adminClerkId],
    );
    if (rows.length === 0) {
      await pool.query(
        "INSERT INTO users (clerk_id, name, email, role) VALUES ($1, $2, $3, $4)",
        [adminClerkId, adminName, adminEmail, "admin"],
      );
      console.log(`Admin user created: ${adminName} <${adminEmail}>`);
    } else {
      await pool.query(
        "UPDATE users SET role = 'admin' WHERE clerk_id = $1",
        [adminClerkId],
      );
      console.log(`Admin role confirmed for: ${adminClerkId}`);
    }
  } else {
    console.log(
      "Tip: Set ADMIN_CLERK_ID env var to seed the initial admin user.\n" +
        "     First user to sign in is auto-provisioned as employee;\n" +
        "     promote via PATCH /api/users/:userId.",
    );
  }

  console.log("Seed complete.");
} finally {
  await pool.end();
}
