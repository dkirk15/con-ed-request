import { pool } from "./helpers/db";

/**
 * Sweep up any rows created by the E2E suite. Test users are created with a
 * recognizable email pattern and clinics with an `E2E-` prefix, so we can
 * remove them and their dependent rows without touching real data in the
 * shared development database.
 */
export default async function globalTeardown() {
  try {
    await pool.query(`
      WITH test_users AS (
        SELECT id FROM users WHERE email LIKE 'e2e.%+clerk_test@example.com'
      ),
      test_requests AS (
        SELECT id FROM con_ed_requests WHERE employee_id IN (SELECT id FROM test_users)
      )
      DELETE FROM reimbursements WHERE request_id IN (SELECT id FROM test_requests);
    `);
    await pool.query(`
      DELETE FROM receipts
      WHERE request_id IN (
        SELECT id FROM con_ed_requests
        WHERE employee_id IN (SELECT id FROM users WHERE email LIKE 'e2e.%+clerk_test@example.com')
      );
    `);
    await pool.query(`
      DELETE FROM repayment_guarantees
      WHERE employee_id IN (SELECT id FROM users WHERE email LIKE 'e2e.%+clerk_test@example.com');
    `);
    await pool.query(`
      DELETE FROM con_ed_requests
      WHERE employee_id IN (SELECT id FROM users WHERE email LIKE 'e2e.%+clerk_test@example.com')
         OR manager_id IN (SELECT id FROM users WHERE email LIKE 'e2e.%+clerk_test@example.com')
         OR bo_approver_id IN (SELECT id FROM users WHERE email LIKE 'e2e.%+clerk_test@example.com');
    `);
    await pool.query(
      `DELETE FROM users WHERE email LIKE 'e2e.%+clerk_test@example.com';`,
    );
    await pool.query(`DELETE FROM clinics WHERE name LIKE 'E2E-%';`);
  } finally {
    await pool.end();
  }
}
