import { db } from "@workspace/db";
import { conEdRequests, users, clinics, repaymentGuarantees, receipts, reimbursements } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export async function formatRequestSimple(row: typeof conEdRequests.$inferSelect) {
  const [employee] = await db
    .select({ name: users.name, email: users.email, clinicId: users.clinicId })
    .from(users)
    .where(eq(users.id, row.employeeId))
    .limit(1);

  let clinicName: string | null = null;
  if (employee?.clinicId) {
    const [clinic] = await db
      .select({ name: clinics.name })
      .from(clinics)
      .where(eq(clinics.id, employee.clinicId))
      .limit(1);
    clinicName = clinic?.name ?? null;
  }

  let managerName: string | null = null;
  if (row.managerId) {
    const [mgr] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.managerId)).limit(1);
    managerName = mgr?.name ?? null;
  }

  let boApproverName: string | null = null;
  if (row.boApproverId) {
    const [bo] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.boApproverId)).limit(1);
    boApproverName = bo?.name ?? null;
  }

  const [guarantee] = await db
    .select()
    .from(repaymentGuarantees)
    .where(eq(repaymentGuarantees.requestId, row.id))
    .limit(1);

  const reqReceipts = await db.select().from(receipts).where(eq(receipts.requestId, row.id));

  const [reimbursement] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.requestId, row.id))
    .limit(1);

  let reimbursementMarkedByName: string | null = null;
  if (reimbursement?.markedById) {
    const [marker] = await db.select({ name: users.name }).from(users).where(eq(users.id, reimbursement.markedById)).limit(1);
    reimbursementMarkedByName = marker?.name ?? null;
  }

  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: employee?.name ?? null,
    employeeEmail: employee?.email ?? null,
    clinicName,
    status: row.status,
    courseNames: row.courseNames,
    courseDates: row.courseDates ?? null,
    ceuCount: row.ceuCount ? parseFloat(row.ceuCount) : null,
    location: row.location ?? null,
    tuition: row.tuition ? parseFloat(row.tuition) : null,
    lodging: row.lodging ? parseFloat(row.lodging) : null,
    airfare: row.airfare ? parseFloat(row.airfare) : null,
    rentalCar: row.rentalCar ? parseFloat(row.rentalCar) : null,
    parking: row.parking ? parseFloat(row.parking) : null,
    otherCosts: row.otherCosts ? parseFloat(row.otherCosts) : null,
    totalRequested: parseFloat(row.totalRequested),
    approvedTuition: row.approvedTuition ? parseFloat(row.approvedTuition) : null,
    approvedLodging: row.approvedLodging ? parseFloat(row.approvedLodging) : null,
    approvedAirfare: row.approvedAirfare ? parseFloat(row.approvedAirfare) : null,
    approvedRentalCar: row.approvedRentalCar ? parseFloat(row.approvedRentalCar) : null,
    approvedParking: row.approvedParking ? parseFloat(row.approvedParking) : null,
    approvedOther: row.approvedOther ? parseFloat(row.approvedOther) : null,
    totalApproved: row.totalApproved ? parseFloat(row.totalApproved) : null,
    managerId: row.managerId ?? null,
    managerName,
    managerApprovedAt: row.managerApprovedAt?.toISOString() ?? null,
    managerDeniedAt: row.managerDeniedAt?.toISOString() ?? null,
    managerDenialReason: row.managerDenialReason ?? null,
    boApproverId: row.boApproverId ?? null,
    boApproverName,
    boApprovedAt: row.boApprovedAt?.toISOString() ?? null,
    boDeniedAt: row.boDeniedAt?.toISOString() ?? null,
    boDenialReason: row.boDenialReason ?? null,
    remainingBalanceAfter: null,
    requiresRepaymentGuarantee: row.requiresRepaymentGuarantee,
    repaymentGuarantee: guarantee ? {
      id: guarantee.id,
      requestId: guarantee.requestId,
      employeeId: guarantee.employeeId,
      signedName: guarantee.signedName,
      signedAt: guarantee.signedAt.toISOString(),
    } : null,
    receipts: reqReceipts.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      fileUrl: r.fileUrl,
      fileName: r.fileName ?? null,
      uploadedAt: r.uploadedAt.toISOString(),
    })),
    reimbursement: reimbursement ? {
      id: reimbursement.id,
      requestId: reimbursement.requestId,
      paycheckDate: reimbursement.paycheckDate,
      markedById: reimbursement.markedById ?? null,
      markedByName: reimbursementMarkedByName,
      markedAt: reimbursement.markedAt.toISOString(),
    } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
