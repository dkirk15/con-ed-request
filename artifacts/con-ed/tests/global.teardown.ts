import { pool } from "./helpers/db";

/**
 * Sweep up any rows created by the E2E suite. Test users are created with a
 * recognizable email pattern and clinics with an `E2E-` prefix, so we can
 * remove them and their dependent rows without touching real data in the
 * shared development database.
 *
 * Delete order respects FK constraints:
 *   repayment_guarantees → receipts → reimbursements
 *   → con_ed_requests → users → clinics
 */
export default async function globalTeardown() {
  try {
    const testUsers = `(SELECT id FROM users WHERE email LIKE 'e2e.%+clerk_test@osstherapy.com')`;
    const testClinics = `(SELECT id FROM clinics WHERE name LIKE 'E2E-%')`;
    const testRequests = `(
      SELECT id FROM con_ed_requests
      WHERE employee_id    IN ${testUsers}
         OR manager_id     IN ${testUsers}
         OR bo_approver_id IN ${testUsers}
         OR employee_id IN (SELECT id FROM users WHERE clinic_id IN ${testClinics})
    )`;

    await pool.query(`DELETE FROM repayment_guarantees WHERE request_id IN ${testRequests} OR employee_id IN ${testUsers}`);
    await pool.query(`DELETE FROM receipts             WHERE request_id IN ${testRequests}`);
    await pool.query(`DELETE FROM reimbursements       WHERE request_id IN ${testRequests} OR marked_by_id IN ${testUsers}`);
    await pool.query(`DELETE FROM con_ed_requests      WHERE id IN ${testRequests}`);
    await pool.query(`UPDATE users SET manager_id = NULL WHERE manager_id IN ${testUsers}`);
    await pool.query(`UPDATE users SET clinic_id  = NULL WHERE clinic_id  IN ${testClinics}`);
    await pool.query(`DELETE FROM users   WHERE email LIKE 'e2e.%+clerk_test@osstherapy.com'`);
    await pool.query(`DELETE FROM clinics WHERE name LIKE 'E2E-%'`);
  } finally {
    await pool.end();
  }
}
