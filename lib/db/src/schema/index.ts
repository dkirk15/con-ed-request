import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  date,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", [
  "employee",
  "manager",
  "business_office",
  "accounting",
  "admin",
]);

export const requestStatusEnum = pgEnum("request_status", [
  "draft",
  "pending_manager",
  "manager_approved",
  "manager_denied",
  "pending_bo",
  "bo_approved",
  "bo_denied",
  "awaiting_receipt",
  "receipt_submitted",
  "reimbursed",
  "cancelled",
]);

export const clinics = pgTable("clinics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: roleEnum("role").notNull().default("employee"),
  clinicId: integer("clinic_id").references(() => clinics.id),
  managerId: integer("manager_id"),
  hireDate: date("hire_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conEdRequests = pgTable("con_ed_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => users.id),
  status: requestStatusEnum("status").notNull().default("draft"),
  courseNames: text("course_names").notNull(),
  courseDates: text("course_dates"),
  ceuCount: numeric("ceu_count", { precision: 5, scale: 1 }),
  location: text("location"),
  tuition: numeric("tuition", { precision: 10, scale: 2 }),
  lodging: numeric("lodging", { precision: 10, scale: 2 }),
  airfare: numeric("airfare", { precision: 10, scale: 2 }),
  rentalCar: numeric("rental_car", { precision: 10, scale: 2 }),
  parking: numeric("parking", { precision: 10, scale: 2 }),
  otherCosts: numeric("other_costs", { precision: 10, scale: 2 }),
  totalRequested: numeric("total_requested", { precision: 10, scale: 2 }).notNull(),
  approvedTuition: numeric("approved_tuition", { precision: 10, scale: 2 }),
  approvedLodging: numeric("approved_lodging", { precision: 10, scale: 2 }),
  approvedAirfare: numeric("approved_airfare", { precision: 10, scale: 2 }),
  approvedRentalCar: numeric("approved_rental_car", { precision: 10, scale: 2 }),
  approvedParking: numeric("approved_parking", { precision: 10, scale: 2 }),
  approvedOther: numeric("approved_other", { precision: 10, scale: 2 }),
  totalApproved: numeric("total_approved", { precision: 10, scale: 2 }),
  managerId: integer("manager_id").references(() => users.id),
  managerApprovedAt: timestamp("manager_approved_at"),
  managerDeniedAt: timestamp("manager_denied_at"),
  managerDenialReason: text("manager_denial_reason"),
  boApproverId: integer("bo_approver_id").references(() => users.id),
  boApprovedAt: timestamp("bo_approved_at"),
  boDeniedAt: timestamp("bo_denied_at"),
  boDenialReason: text("bo_denial_reason"),
  requiresRepaymentGuarantee: boolean("requires_repayment_guarantee").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const repaymentGuarantees = pgTable("repayment_guarantees", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => conEdRequests.id),
  employeeId: integer("employee_id").notNull().references(() => users.id),
  signedName: text("signed_name").notNull(),
  signedDate: text("signed_date"),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
});

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => conEdRequests.id),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const reimbursements = pgTable("reimbursements", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => conEdRequests.id),
  paycheckDate: date("paycheck_date").notNull(),
  markedById: integer("marked_by_id").references(() => users.id),
  markedAt: timestamp("marked_at").defaultNow().notNull(),
});
