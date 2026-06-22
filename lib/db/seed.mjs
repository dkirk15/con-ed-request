/**
 * Seed script: 25 OSS clinic locations + initial admin user placeholder.
 * Run with: node lib/db/seed.mjs
 */
import pg from "pg";

const { Pool } = pg;

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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  console.log("Seeding clinics…");
  let inserted = 0;
  for (const name of CLINIC_NAMES) {
    const { rows } = await pool.query("SELECT id FROM clinics WHERE name = $1 LIMIT 1", [name]);
    if (rows.length === 0) {
      await pool.query("INSERT INTO clinics (name) VALUES ($1)", [name]);
      inserted++;
    }
  }
  console.log(`Clinics: ${inserted} inserted, ${CLINIC_NAMES.length - inserted} already existed.`);

  const adminClerkId = process.env.ADMIN_CLERK_ID;
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@osstherapy.com";
  const adminName = process.env.ADMIN_NAME ?? "OSS Administrator";

  if (adminClerkId) {
    const { rows } = await pool.query("SELECT id FROM users WHERE clerk_id = $1 LIMIT 1", [adminClerkId]);
    if (rows.length === 0) {
      await pool.query(
        "INSERT INTO users (clerk_id, name, email, role) VALUES ($1, $2, $3, $4)",
        [adminClerkId, adminName, adminEmail, "admin"]
      );
      console.log(`Admin user created: ${adminName} <${adminEmail}>`);
    } else {
      await pool.query("UPDATE users SET role = 'admin' WHERE clerk_id = $1", [adminClerkId]);
      console.log(`Admin user role confirmed: ${adminClerkId}`);
    }
  } else {
    console.log(
      "Tip: Set ADMIN_CLERK_ID env var to seed the initial admin user.\n" +
      "     First user to sign in is auto-provisioned as employee;\n" +
      "     promote via PATCH /api/users/:userId."
    );
  }

  console.log("Seed complete.");
} finally {
  await pool.end();
}
