import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the E2E suite.");
}

export const pool = new Pool({ connectionString });

export type Role =
  | "employee"
  | "manager"
  | "business_office"
  | "accounting"
  | "admin";

export type RequestStatus =
  | "draft"
  | "pending_manager"
  | "manager_approved"
  | "manager_denied"
  | "pending_bo"
  | "bo_approved"
  | "bo_denied"
  | "awaiting_receipt"
  | "receipt_submitted"
  | "reimbursed"
  | "cancelled";

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function insertRow(
  table: string,
  data: Record<string, unknown>,
): Promise<number> {
  const keys = Object.keys(data);
  const cols = keys.join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const values = keys.map((k) => data[k]);
  const rows = await query<{ id: number }>(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING id`,
    values,
  );
  return rows[0].id;
}

export async function createClinic(name: string): Promise<number> {
  const existing = await query<{ id: number }>(
    "SELECT id FROM clinics WHERE name = $1",
    [name],
  );
  if (existing.length > 0) return existing[0].id;
  return insertRow("clinics", { name });
}

export interface InsertUserInput {
  clerkId: string;
  name: string;
  email: string;
  role: Role;
  clinicId?: number | null;
  managerId?: number | null;
  hireDate?: string | null;
}

export async function insertUser(input: InsertUserInput): Promise<number> {
  return insertRow("users", {
    clerk_id: input.clerkId,
    name: input.name,
    email: input.email,
    role: input.role,
    clinic_id: input.clinicId ?? null,
    manager_id: input.managerId ?? null,
    hire_date: input.hireDate ?? null,
  });
}

export interface InsertRequestInput {
  employeeId: number;
  managerId?: number | null;
  status: RequestStatus;
  courseNames: string;
  courseDates?: string | null;
  ceuCount?: number | null;
  location?: string | null;
  tuition?: number | null;
  lodging?: number | null;
  airfare?: number | null;
  rentalCar?: number | null;
  parking?: number | null;
  otherCosts?: number | null;
  totalRequested: number;
  approvedTuition?: number | null;
  approvedLodging?: number | null;
  approvedAirfare?: number | null;
  approvedRentalCar?: number | null;
  approvedParking?: number | null;
  approvedOther?: number | null;
  totalApproved?: number | null;
  boApproverId?: number | null;
  requiresRepaymentGuarantee?: boolean;
  createdAt?: Date | null;
}

export async function insertRequest(input: InsertRequestInput): Promise<number> {
  const data: Record<string, unknown> = {
    employee_id: input.employeeId,
    manager_id: input.managerId ?? null,
    status: input.status,
    course_names: input.courseNames,
    course_dates: input.courseDates ?? null,
    ceu_count: input.ceuCount ?? null,
    location: input.location ?? null,
    tuition: input.tuition ?? null,
    lodging: input.lodging ?? null,
    airfare: input.airfare ?? null,
    rental_car: input.rentalCar ?? null,
    parking: input.parking ?? null,
    other_costs: input.otherCosts ?? null,
    total_requested: input.totalRequested,
    approved_tuition: input.approvedTuition ?? null,
    approved_lodging: input.approvedLodging ?? null,
    approved_airfare: input.approvedAirfare ?? null,
    approved_rental_car: input.approvedRentalCar ?? null,
    approved_parking: input.approvedParking ?? null,
    approved_other: input.approvedOther ?? null,
    total_approved: input.totalApproved ?? null,
    bo_approver_id: input.boApproverId ?? null,
    requires_repayment_guarantee: input.requiresRepaymentGuarantee ?? false,
  };
  if (input.createdAt) {
    data.created_at = input.createdAt;
  }
  return insertRow("con_ed_requests", data);
}

export interface RequestRow {
  id: number;
  status: RequestStatus;
  total_requested: string;
  total_approved: string | null;
  requires_repayment_guarantee: boolean;
  manager_id: number | null;
  bo_approver_id: number | null;
  manager_approved_at: Date | null;
  bo_approved_at: Date | null;
  [key: string]: unknown;
}

export async function getRequest(id: number): Promise<RequestRow | undefined> {
  const rows = await query<RequestRow>(
    "SELECT * FROM con_ed_requests WHERE id = $1",
    [id],
  );
  return rows[0];
}

export async function insertReceipt(
  requestId: number,
  fileName = "e2e-receipt.pdf",
): Promise<number> {
  return insertRow("receipts", {
    request_id: requestId,
    file_url: `/requests/${requestId}/${fileName}`,
    file_name: fileName,
  });
}

export interface ReimbursementRow {
  id: number;
  request_id: number;
  amount: string | null;
  paycheck_date: string;
  marked_by_id: number | null;
  marked_at: Date;
}

export async function getReimbursement(
  requestId: number,
): Promise<ReimbursementRow | undefined> {
  const rows = await query<ReimbursementRow>(
    "SELECT * FROM reimbursements WHERE request_id = $1",
    [requestId],
  );
  return rows[0];
}

export interface UserRow {
  id: number;
  role: Role;
  email: string;
  name: string;
  clinic_id: number | null;
  manager_id: number | null;
  hire_date: string | null;
  [key: string]: unknown;
}

export async function getUserByEmail(
  email: string,
): Promise<UserRow | undefined> {
  const rows = await query<UserRow>("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  return rows[0];
}

/**
 * Updates a user's role/assignment by email. Mirrors what an admin does after
 * Clerk auto-provisions a brand-new account as `employee`: the DB record is
 * promoted to its real role and given a clinic/manager.
 */
export async function setRole(
  email: string,
  input: {
    role: Role;
    clinicId?: number | null;
    managerId?: number | null;
    hireDate?: string | null;
  },
): Promise<void> {
  await query(
    `UPDATE users
       SET role = $1, clinic_id = $2, manager_id = $3, hire_date = $4
     WHERE email = $5`,
    [
      input.role,
      input.clinicId ?? null,
      input.managerId ?? null,
      input.hireDate ?? null,
      email,
    ],
  );
}

export async function getRepaymentGuarantee(
  requestId: number,
): Promise<Record<string, unknown> | undefined> {
  const rows = await query("SELECT * FROM repayment_guarantees WHERE request_id = $1", [
    requestId,
  ]);
  return rows[0];
}

export async function closePool(): Promise<void> {
  await pool.end();
}
