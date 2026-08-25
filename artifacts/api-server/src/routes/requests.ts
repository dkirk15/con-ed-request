import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  conEdRequests,
  users,
  clinics,
  conEdRequestEvents,
  repaymentGuarantees,
  receipts,
  reimbursements,
} from "@workspace/db/schema";
import { asc, desc, eq, and, gte, ilike, inArray, or, sql, lt } from "drizzle-orm";
import {
  CreateRequestBody,
  UpdateRequestBody,
  UpdateRequestParams,
  GetRequestParams,
  CancelRequestParams,
  ManagerApproveRequestParams,
  ManagerDenyRequestParams,
  ManagerDenyRequestBody,
  BoApproveRequestParams,
  BoApproveRequestBody,
  BoDenyRequestParams,
  BoDenyRequestBody,
  SignRepaymentGuaranteeParams,
  SignRepaymentGuaranteeBody,
  SubmitReceiptParams,
  SubmitReceiptBody,
  MarkReimbursedParams,
  MarkReimbursedBody,
  ListReceiptsParams,
  ListRequestsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";
import { getUserBalance } from "../lib/balance";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  detectReceiptType,
  MAX_RECEIPT_SIZE_BYTES,
  receiptNameMatchesType,
} from "../lib/receiptFiles";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const SUBMITTED_STATUSES = [
  "pending_manager",
  "pending_bo",
  "manager_denied",
  "bo_denied",
  "awaiting_receipt",
  "receipt_submitted",
  "reimbursed",
  "cancelled",
] as const;

async function formatRequest(req_row: typeof conEdRequests.$inferSelect) {
  const [employee] = await db
    .select({ name: users.name, email: users.email, clinicId: users.clinicId })
    .from(users)
    .where(eq(users.id, req_row.employeeId))
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
  if (req_row.managerId) {
    const [mgr] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, req_row.managerId))
      .limit(1);
    managerName = mgr?.name ?? null;
  }

  let boApproverName: string | null = null;
  if (req_row.boApproverId) {
    const [bo] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, req_row.boApproverId))
      .limit(1);
    boApproverName = bo?.name ?? null;
  }

  let reopenerName: string | null = null;
  if (req_row.reopenerId) {
    const [reopener] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, req_row.reopenerId))
      .limit(1);
    reopenerName = reopener?.name ?? null;
  }

  const requestEvents = await db
    .select({
      id: conEdRequestEvents.id,
      type: conEdRequestEvents.type,
      actorName: users.name,
      reason: conEdRequestEvents.reason,
      createdAt: conEdRequestEvents.createdAt,
    })
    .from(conEdRequestEvents)
    .leftJoin(users, eq(conEdRequestEvents.actorId, users.id))
    .where(eq(conEdRequestEvents.requestId, req_row.id))
    .orderBy(asc(conEdRequestEvents.createdAt), asc(conEdRequestEvents.id));

  const [guarantee] = await db
    .select()
    .from(repaymentGuarantees)
    .where(eq(repaymentGuarantees.requestId, req_row.id))
    .limit(1);

  const reqReceipts = await db
    .select()
    .from(receipts)
    .where(eq(receipts.requestId, req_row.id));

  const [reimbursement] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.requestId, req_row.id))
    .limit(1);

  let reimbursementMarkedByName: string | null = null;
  if (reimbursement?.markedById) {
    const [marker] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, reimbursement.markedById))
      .limit(1);
    reimbursementMarkedByName = marker?.name ?? null;
  }

  return {
    id: req_row.id,
    employeeId: req_row.employeeId,
    employeeName: employee?.name ?? null,
    employeeEmail: employee?.email ?? null,
    clinicName,
    status: req_row.status,
    courseNames: req_row.courseNames,
    courseProvider: req_row.courseProvider ?? null,
    courseUrl: req_row.courseUrl ?? null,
    courseStartDate: req_row.courseStartDate ?? null,
    courseEndDate: req_row.courseEndDate ?? null,
    deliveryMethod: req_row.deliveryMethod ?? null,
    courseDates: req_row.courseDates ?? null,
    ceuCount: req_row.ceuCount ? parseFloat(req_row.ceuCount) : null,
    location: req_row.location ?? null,
    tuition: req_row.tuition ? parseFloat(req_row.tuition) : null,
    lodging: req_row.lodging ? parseFloat(req_row.lodging) : null,
    airfare: req_row.airfare ? parseFloat(req_row.airfare) : null,
    rentalCar: req_row.rentalCar ? parseFloat(req_row.rentalCar) : null,
    parking: req_row.parking ? parseFloat(req_row.parking) : null,
    otherCosts: req_row.otherCosts ? parseFloat(req_row.otherCosts) : null,
    totalRequested: parseFloat(req_row.totalRequested),
    approvedTuition: req_row.approvedTuition ? parseFloat(req_row.approvedTuition) : null,
    approvedLodging: req_row.approvedLodging ? parseFloat(req_row.approvedLodging) : null,
    approvedAirfare: req_row.approvedAirfare ? parseFloat(req_row.approvedAirfare) : null,
    approvedRentalCar: req_row.approvedRentalCar ? parseFloat(req_row.approvedRentalCar) : null,
    approvedParking: req_row.approvedParking ? parseFloat(req_row.approvedParking) : null,
    approvedOther: req_row.approvedOther ? parseFloat(req_row.approvedOther) : null,
    totalApproved: req_row.totalApproved ? parseFloat(req_row.totalApproved) : null,
    managerId: req_row.managerId ?? null,
    managerName,
    managerApprovedAt: req_row.managerApprovedAt?.toISOString() ?? null,
    managerDeniedAt: req_row.managerDeniedAt?.toISOString() ?? null,
    managerDenialReason: req_row.managerDenialReason ?? null,
    boApproverId: req_row.boApproverId ?? null,
    boApproverName,
    boApprovedAt: req_row.boApprovedAt?.toISOString() ?? null,
    boDeniedAt: req_row.boDeniedAt?.toISOString() ?? null,
    boDenialReason: req_row.boDenialReason ?? null,
    reopenedAt: req_row.reopenedAt?.toISOString() ?? null,
    reopenerName,
    timelineEvents: requestEvents.map((event) => ({
      id: event.id,
      type: event.type,
      actorName: event.actorName ?? null,
      reason: event.reason ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
    remainingBalanceAfter: null,
    requiresRepaymentGuarantee: req_row.requiresRepaymentGuarantee,
    repaymentGuarantee: guarantee
      ? {
          id: guarantee.id,
          requestId: guarantee.requestId,
          employeeId: guarantee.employeeId,
          signedName: guarantee.signedName,
          signedDate: guarantee.signedDate ?? null,
          signedAt: guarantee.signedAt.toISOString(),
          acknowledged: guarantee.acknowledged,
          email: guarantee.email ?? null,
          ipAddress: guarantee.ipAddress ?? null,
          sessionId: guarantee.sessionId ?? null,
        }
      : null,
    receipts: reqReceipts.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      fileUrl: r.fileUrl,
      fileName: r.fileName ?? null,
      uploadedAt: r.uploadedAt.toISOString(),
    })),
    reimbursement: reimbursement
      ? {
          id: reimbursement.id,
          requestId: reimbursement.requestId,
          amount: reimbursement.amount ? parseFloat(reimbursement.amount) : null,
          paycheckDate: reimbursement.paycheckDate,
          markedById: reimbursement.markedById ?? null,
          markedByName: reimbursementMarkedByName,
          markedAt: reimbursement.markedAt.toISOString(),
        }
      : null,
    createdAt: req_row.createdAt.toISOString(),
    updatedAt: req_row.updatedAt.toISOString(),
  };
}

// GET /api/requests
router.get("/requests", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = ListRequestsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request filters" });
      return;
    }

    const user = req.dbUser!;
    const conditions = [];
    const {
      status,
      employeeId,
      clinicId,
      search,
      year,
      scope = "all",
      sort = "updatedAt",
      order = "desc",
      page = 1,
      pageSize = 25,
    } = parsed.data;

    if (status) {
      conditions.push(
        eq(
          conEdRequests.status,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status as any,
        ),
      );
    }

    // Scope by role
    if (user.role === "employee") {
      conditions.push(eq(conEdRequests.employeeId, user.id));
    } else if (user.role === "manager") {
      // Managers see all of their own requests plus submitted clinic requests.
      const clinicEmployees = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clinicId, user.clinicId ?? -1));
      const ids = clinicEmployees.map((e) => e.id);
      const clinicSubmitted = ids.length
        ? and(
            inArray(conEdRequests.employeeId, ids),
            inArray(conEdRequests.status, SUBMITTED_STATUSES),
          )
        : undefined;
      conditions.push(
        clinicSubmitted
          ? or(eq(conEdRequests.employeeId, user.id), clinicSubmitted)!
          : eq(conEdRequests.employeeId, user.id),
      );
    }
    // business_office, accounting, admin see all

    if (scope === "mine") {
      conditions.push(eq(conEdRequests.employeeId, user.id));
    } else if (employeeId != null) {
      conditions.push(eq(conEdRequests.employeeId, Number(employeeId)));
    }

    if (clinicId != null) {
      const clinicUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clinicId, Number(clinicId)));
      const clinicUserIds = clinicUsers.map((clinicUser) => clinicUser.id);
      conditions.push(
        clinicUserIds.length
          ? inArray(conEdRequests.employeeId, clinicUserIds)
          : sql`false`,
      );
    }

    if (year != null) {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year + 1, 0, 1));
      conditions.push(gte(conEdRequests.createdAt, start));
      conditions.push(lt(conEdRequests.createdAt, end));
    }

    if (search?.trim()) {
      const query = `%${search.trim()}%`;
      const matchingUsers = await db
        .select({ id: users.id })
        .from(users)
        .leftJoin(clinics, eq(users.clinicId, clinics.id))
        .where(
          or(
            ilike(users.name, query),
            ilike(users.email, query),
            ilike(clinics.name, query),
          ),
        );
      const matchingUserIds = matchingUsers.map((matchingUser) => matchingUser.id);
      conditions.push(
        or(
          ilike(conEdRequests.courseNames, query),
          ilike(conEdRequests.courseProvider, query),
          ilike(conEdRequests.location, query),
          ...(matchingUserIds.length
            ? [inArray(conEdRequests.employeeId, matchingUserIds)]
            : []),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const sortColumns = {
      createdAt: conEdRequests.createdAt,
      updatedAt: conEdRequests.updatedAt,
      courseNames: conEdRequests.courseNames,
      totalRequested: conEdRequests.totalRequested,
      status: conEdRequests.status,
    } as const;
    const sortColumn = sortColumns[sort];
    const orderBy = order === "asc" ? asc(sortColumn) : desc(sortColumn);
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(conEdRequests)
      .where(whereClause);
    const rows = await db
      .select()
      .from(conEdRequests)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    const formatted = await Promise.all(rows.map(formatRequest));
    res.json({
      items: formatted,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    req.log.error({ err }, "listRequests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/requests
router.post("/requests", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = CreateRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const user = req.dbUser!;
    if (user.role !== "employee" && user.role !== "manager") {
      res.status(403).json({ error: "Only employees and managers can submit CE requests" });
      return;
    }

    const {
      courseNames,
      courseProvider,
      courseUrl,
      courseStartDate,
      courseEndDate,
      deliveryMethod,
      courseDates,
      ceuCount,
      location,
      tuition,
      lodging,
      airfare,
      rentalCar,
      parking,
      otherCosts,
      totalRequested,
    } = parsed.data;

    // Assign manager from employee's profile or clinic lookup
    let managerId: number | null = null;
    if (user.managerId) {
      managerId = user.managerId;
    } else if (user.clinicId) {
      const [mgr] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.clinicId, user.clinicId), eq(users.role, "manager")))
        .limit(1);
      managerId = mgr?.id ?? null;
    }

    // Compute over-budget: if this request would push the employee over their allocation
    const balance = await getUserBalance(user.id, user.hireDate, user.conEdAllocation);
    const requiresRepaymentGuarantee = totalRequested > balance.remainingAmount;

    const [newRequest] = await db
      .insert(conEdRequests)
      .values({
        employeeId: user.id,
        courseNames,
        courseProvider: courseProvider ?? null,
        courseUrl: courseUrl ?? null,
        courseStartDate: courseStartDate ?? null,
        courseEndDate: courseEndDate ?? null,
        deliveryMethod: deliveryMethod ?? null,
        courseDates: courseDates ?? null,
        ceuCount: ceuCount != null ? String(ceuCount) : null,
        location: location ?? null,
        tuition: tuition != null ? String(tuition) : null,
        lodging: lodging != null ? String(lodging) : null,
        airfare: airfare != null ? String(airfare) : null,
        rentalCar: rentalCar != null ? String(rentalCar) : null,
        parking: parking != null ? String(parking) : null,
        otherCosts: otherCosts != null ? String(otherCosts) : null,
        totalRequested: String(totalRequested),
        managerId,
        status: "draft",
        requiresRepaymentGuarantee,
      })
      .returning();

    res.status(201).json(await formatRequest(newRequest));
  } catch (err) {
    req.log.error({ err }, "createRequest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/requests/:requestId/reopen
// Returns a denied request to draft so the employee can edit and resubmit.
router.post(
  "/requests/:requestId/reopen",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const user = req.dbUser!;

      const [existing] = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.id, requestId))
        .limit(1);

      if (!existing || existing.employeeId !== user.id) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      if (existing.status !== "manager_denied" && existing.status !== "bo_denied") {
        res.status(400).json({ error: "Only denied requests can be re-opened for revision" });
        return;
      }

      const now = new Date();
      const updated = await db.transaction(async (tx) => {
        const [nextRequest] = await tx
          .update(conEdRequests)
          .set({
            status: "draft",
            reopenedAt: now,
            reopenerId: user.id,
            updatedAt: now,
          })
          .where(eq(conEdRequests.id, requestId))
          .returning();
        await tx.insert(conEdRequestEvents).values({
          requestId,
          type: "reopened",
          actorId: user.id,
          createdAt: now,
        });
        return nextRequest;
      });

      res.json(await formatRequest(updated));
    } catch (err) {
      req.log.error({ err }, "reopenRequest error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/requests/:requestId/submit
// Moves a draft request to pending_manager (or pending_bo for previously BO-denied requests),
// validating guarantee for over-budget requests.
router.post(
  "/requests/:requestId/submit",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const user = req.dbUser!;

      const [existing] = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.id, requestId))
        .limit(1);

      if (!existing || existing.employeeId !== user.id) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      if (existing.status !== "draft") {
        res.status(400).json({ error: "Only draft requests can be submitted" });
        return;
      }

      const missingCourseDetails = [
        !existing.courseProvider?.trim() && "provider",
        !existing.courseStartDate && "start date",
        !existing.courseEndDate && "end date",
        !existing.deliveryMethod && "delivery method",
        (existing.deliveryMethod === "in_person" || existing.deliveryMethod === "hybrid")
          && !existing.location?.trim() && "location",
      ].filter(Boolean);

      if (missingCourseDetails.length > 0) {
        res.status(400).json({
          error: `Complete the course ${missingCourseDetails.join(", ")} before submitting for approval.`,
        });
        return;
      }

      if (existing.courseEndDate! < existing.courseStartDate!) {
        res.status(400).json({ error: "Course end date cannot be before the start date." });
        return;
      }

      const body = req.body ?? {};
      const guaranteeSignedName: string | undefined =
        typeof body.guaranteeSignedName === "string" ? body.guaranteeSignedName.trim() || undefined : undefined;
      const guaranteeSignedDate: string | undefined =
        typeof body.guaranteeSignedDate === "string" ? body.guaranteeSignedDate.trim() || undefined : undefined;
      const guaranteeAcknowledged: boolean = body.guaranteeAcknowledged === true;

      const balance = await getUserBalance(user.id, user.hireDate, user.conEdAllocation);
      const requiresRepaymentGuarantee =
        parseFloat(existing.totalRequested) > balance.remainingAmount;

      // Enforce repayment guarantee at submission time for over-budget requests.
      if (requiresRepaymentGuarantee) {
        const [existingGuarantee] = await db
          .select({ id: repaymentGuarantees.id })
          .from(repaymentGuarantees)
          .where(eq(repaymentGuarantees.requestId, requestId))
          .limit(1);

        if (!existingGuarantee) {
          if (!guaranteeSignedName || !guaranteeSignedDate || !guaranteeAcknowledged) {
            res.status(400).json({
              error: "This request exceeds your annual budget. A repayment guarantee (signed name, date, and acknowledgment) is required before submission.",
            });
            return;
          }
          const { sessionId } = getAuth(req);
          await db.insert(repaymentGuarantees).values({
            requestId,
            employeeId: user.id,
            signedName: guaranteeSignedName,
            signedDate: guaranteeSignedDate,
            email: user.email,
            ipAddress: req.ip ?? null,
            sessionId: sessionId ?? null,
            acknowledged: true,
          });
        }
      }

      // If the request was previously BO-denied and re-opened, manager approval
      // already stands — skip back to pending_bo instead of going through manager again.
      const targetStatus = existing.managerApprovedAt != null ? "pending_bo" : "pending_manager";

      const [updated] = await db
        .update(conEdRequests)
        .set({
          status: targetStatus,
          requiresRepaymentGuarantee,
          updatedAt: new Date(),
        })
        .where(eq(conEdRequests.id, requestId))
        .returning();

      res.json(await formatRequest(updated));
    } catch (err) {
      req.log.error({ err }, "submitRequest error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/requests/:requestId
router.get("/requests/:requestId", requireAuth, async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId as string);
    const user = req.dbUser!;

    const [row] = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.id, requestId))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    // Scope: employee can only view own requests
    if (user.role === "employee" && row.employeeId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Managers can view their own requests. Other drafts are private until submitted.
    if (user.role === "manager") {
      if (row.employeeId === user.id) {
        res.json(await formatRequest(row));
        return;
      }
      if (row.status === "draft") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!user.clinicId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const [emp] = await db
        .select({ clinicId: users.clinicId })
        .from(users)
        .where(eq(users.id, row.employeeId))
        .limit(1);
      if (!emp || emp.clinicId !== user.clinicId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    // business_office, accounting, admin can view all

    res.json(await formatRequest(row));
  } catch (err) {
    req.log.error({ err }, "getRequest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/requests/:requestId
router.patch("/requests/:requestId", requireAuth, async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId as string);
    const parsed = UpdateRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const [existing] = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.id, requestId))
      .limit(1);

    if (!existing || existing.employeeId !== req.dbUser!.id) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    // Can only edit while still a draft.
    if (existing.status !== "draft") {
      res.status(400).json({ error: "Request cannot be edited once submitted for approval" });
      return;
    }

    const data = parsed.data;
    const nextStartDate = data.courseStartDate === undefined
      ? existing.courseStartDate
      : data.courseStartDate;
    const nextEndDate = data.courseEndDate === undefined
      ? existing.courseEndDate
      : data.courseEndDate;
    if (nextStartDate && nextEndDate && nextEndDate < nextStartDate) {
      res.status(400).json({ error: "Course end date cannot be before the start date." });
      return;
    }

    const updates: Partial<typeof conEdRequests.$inferInsert> = { updatedAt: new Date() };
    if (data.courseNames !== undefined) updates.courseNames = data.courseNames;
    if (data.courseProvider !== undefined) updates.courseProvider = data.courseProvider ?? null;
    if (data.courseUrl !== undefined) updates.courseUrl = data.courseUrl ?? null;
    if (data.courseStartDate !== undefined) updates.courseStartDate = data.courseStartDate ?? null;
    if (data.courseEndDate !== undefined) updates.courseEndDate = data.courseEndDate ?? null;
    if (data.deliveryMethod !== undefined) updates.deliveryMethod = data.deliveryMethod ?? null;
    if (data.courseDates !== undefined) updates.courseDates = data.courseDates ?? null;
    if (data.ceuCount !== undefined) updates.ceuCount = data.ceuCount != null ? String(data.ceuCount) : null;
    if (data.location !== undefined) updates.location = data.location ?? null;
    if (data.tuition !== undefined) updates.tuition = data.tuition != null ? String(data.tuition) : null;
    if (data.lodging !== undefined) updates.lodging = data.lodging != null ? String(data.lodging) : null;
    if (data.airfare !== undefined) updates.airfare = data.airfare != null ? String(data.airfare) : null;
    if (data.rentalCar !== undefined) updates.rentalCar = data.rentalCar != null ? String(data.rentalCar) : null;
    if (data.parking !== undefined) updates.parking = data.parking != null ? String(data.parking) : null;
    if (data.otherCosts !== undefined) updates.otherCosts = data.otherCosts != null ? String(data.otherCosts) : null;
    if (data.totalRequested !== undefined) updates.totalRequested = String(data.totalRequested);

    const nextTotalRequested =
      data.totalRequested !== undefined ? data.totalRequested : parseFloat(existing.totalRequested);
    const balance = await getUserBalance(
      req.dbUser!.id,
      req.dbUser!.hireDate,
      req.dbUser!.conEdAllocation,
    );
    updates.requiresRepaymentGuarantee = nextTotalRequested > balance.remainingAmount;

    const [updated] = await db
      .update(conEdRequests)
      .set(updates)
      .where(eq(conEdRequests.id, requestId))
      .returning();

    res.json(await formatRequest(updated));
  } catch (err) {
    req.log.error({ err }, "updateRequest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/requests/:requestId
router.delete("/requests/:requestId", requireAuth, async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId as string);
    const [existing] = await db
      .select({ id: conEdRequests.id, employeeId: conEdRequests.employeeId, status: conEdRequests.status })
      .from(conEdRequests)
      .where(eq(conEdRequests.id, requestId))
      .limit(1);

    if (!existing || existing.employeeId !== req.dbUser!.id) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    if (existing.status !== "draft") {
      res.status(400).json({ error: "Only draft requests can be deleted" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(repaymentGuarantees)
        .where(eq(repaymentGuarantees.requestId, requestId));
      await tx.delete(conEdRequests).where(eq(conEdRequests.id, requestId));
    });

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "deleteRequest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/requests/:requestId/cancel
router.post("/requests/:requestId/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId as string);
    const [existing] = await db
      .select()
      .from(conEdRequests)
      .where(eq(conEdRequests.id, requestId))
      .limit(1);

    if (!existing || existing.employeeId !== req.dbUser!.id) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    // Only cancellable before BO review
    const cancellableStatuses = ["draft", "pending_manager", "pending_bo"];
    if (!cancellableStatuses.includes(existing.status)) {
      res.status(400).json({ error: "Request cannot be cancelled at this stage" });
      return;
    }

    const [updated] = await db
      .update(conEdRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(conEdRequests.id, requestId))
      .returning();

    res.json(await formatRequest(updated));
  } catch (err) {
    req.log.error({ err }, "cancelRequest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function verifyManagerClinicAccess(
  managerClinicId: number | null,
  requestId: number,
  bypassClinicCheck = false,
): Promise<{ ok: boolean; row?: typeof conEdRequests.$inferSelect }> {
  const [row] = await db
    .select()
    .from(conEdRequests)
    .where(and(eq(conEdRequests.id, requestId), eq(conEdRequests.status, "pending_manager")))
    .limit(1);
  if (!row) return { ok: false };

  // Admins bypass clinic check; managers must have a clinic and match it.
  if (bypassClinicCheck) return { ok: true, row };
  if (managerClinicId === null) return { ok: false };

  const [emp] = await db
    .select({ clinicId: users.clinicId })
    .from(users)
    .where(eq(users.id, row.employeeId))
    .limit(1);
  if (!emp || emp.clinicId !== managerClinicId) return { ok: false };

  return { ok: true, row };
}

// POST /api/requests/:requestId/manager-approve
router.post(
  "/requests/:requestId/manager-approve",
  requireRole("manager", "admin"),
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const user = req.dbUser!;
      const clinicId = user.role === "manager" ? user.clinicId : null;

      const { ok, row: reqRow } = await verifyManagerClinicAccess(
        clinicId,
        requestId,
        user.role === "admin",
      );
      if (!ok || !reqRow) {
        res.status(400).json({ error: "Request not found or not eligible for manager approval" });
        return;
      }

      // Block approval if repayment guarantee is required but not yet signed
      if (reqRow.requiresRepaymentGuarantee) {
        const [guarantee] = await db
          .select({ id: repaymentGuarantees.id })
          .from(repaymentGuarantees)
          .where(eq(repaymentGuarantees.requestId, requestId))
          .limit(1);
        if (!guarantee) {
          res.status(400).json({
            error: "Employee must sign the repayment guarantee before this over-budget request can be approved",
          });
          return;
        }
      }

      const [updated] = await db
        .update(conEdRequests)
        .set({
          status: "pending_bo",
          managerId: user.id,
          managerApprovedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conEdRequests.id, requestId))
        .returning();

      res.json(await formatRequest(updated));
    } catch (err) {
      req.log.error({ err }, "managerApprove error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/requests/:requestId/manager-deny
router.post(
  "/requests/:requestId/manager-deny",
  requireRole("manager", "admin"),
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const user = req.dbUser!;
      const parsed = ManagerDenyRequestBody.safeParse(req.body);
      if (!parsed.success || !parsed.data.reason.trim()) {
        res.status(400).json({ error: "Denial reason required" });
        return;
      }

      const clinicId = user.role === "manager" ? user.clinicId : null;
      const { ok } = await verifyManagerClinicAccess(
        clinicId,
        requestId,
        user.role === "admin",
      );
      if (!ok) {
        res.status(400).json({ error: "Request not found or not eligible for denial" });
        return;
      }

      const now = new Date();
      const reason = parsed.data.reason.trim();
      const updated = await db.transaction(async (tx) => {
        const [nextRequest] = await tx
          .update(conEdRequests)
          .set({
            status: "manager_denied",
            managerId: user.id,
            managerDeniedAt: now,
            managerDenialReason: reason,
            updatedAt: now,
          })
          .where(eq(conEdRequests.id, requestId))
          .returning();
        await tx.insert(conEdRequestEvents).values({
          requestId,
          type: "manager_denied",
          actorId: user.id,
          reason,
          createdAt: now,
        });
        return nextRequest;
      });

      res.json(await formatRequest(updated));
    } catch (err) {
      req.log.error({ err }, "managerDeny error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/requests/:requestId/bo-approve
router.post(
  "/requests/:requestId/bo-approve",
  requireRole("business_office", "admin"),
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const parsed = BoApproveRequestBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid approval data" });
        return;
      }

      const [existing] = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.id, requestId))
        .limit(1);

      if (!existing || existing.status !== "pending_bo") {
        res.status(400).json({ error: "Request is not awaiting Business Office review" });
        return;
      }

      const {
        approvedTuition,
        approvedLodging,
        approvedAirfare,
        approvedRentalCar,
        approvedParking,
        approvedOther,
        totalApproved,
      } = parsed.data;

      const [updated] = await db
        .update(conEdRequests)
        .set({
          status: "awaiting_receipt",
          boApproverId: req.dbUser!.id,
          boApprovedAt: new Date(),
          approvedTuition: approvedTuition != null ? String(approvedTuition) : null,
          approvedLodging: approvedLodging != null ? String(approvedLodging) : null,
          approvedAirfare: approvedAirfare != null ? String(approvedAirfare) : null,
          approvedRentalCar: approvedRentalCar != null ? String(approvedRentalCar) : null,
          approvedParking: approvedParking != null ? String(approvedParking) : null,
          approvedOther: approvedOther != null ? String(approvedOther) : null,
          totalApproved: String(totalApproved),
          updatedAt: new Date(),
        })
        .where(eq(conEdRequests.id, requestId))
        .returning();

      res.json(await formatRequest(updated));
    } catch (err) {
      req.log.error({ err }, "boApprove error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/requests/:requestId/bo-deny
router.post(
  "/requests/:requestId/bo-deny",
  requireRole("business_office", "admin"),
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const parsed = BoDenyRequestBody.safeParse(req.body);
      if (!parsed.success || !parsed.data.reason.trim()) {
        res.status(400).json({ error: "Denial reason required" });
        return;
      }

      const now = new Date();
      const reason = parsed.data.reason.trim();
      const updated = await db.transaction(async (tx) => {
        const [nextRequest] = await tx
          .update(conEdRequests)
          .set({
            status: "bo_denied",
            boApproverId: req.dbUser!.id,
            boDeniedAt: now,
            boDenialReason: reason,
            updatedAt: now,
          })
          .where(and(eq(conEdRequests.id, requestId), eq(conEdRequests.status, "pending_bo")))
          .returning();

        if (!nextRequest) return undefined;

        await tx.insert(conEdRequestEvents).values({
          requestId,
          type: "bo_denied",
          actorId: req.dbUser!.id,
          reason,
          createdAt: now,
        });
        return nextRequest;
      });

      if (!updated) {
        res.status(400).json({ error: "Request is not awaiting Business Office review" });
        return;
      }

      res.json(await formatRequest(updated));
    } catch (err) {
      req.log.error({ err }, "boDeny error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/requests/:requestId/repayment-guarantee
router.post(
  "/requests/:requestId/repayment-guarantee",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const parsed = SignRepaymentGuaranteeBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Signed name required" });
        return;
      }
      const signedName = parsed.data.signedName.trim();
      if (!signedName) {
        res.status(400).json({ error: "Signed name required" });
        return;
      }
      if (parsed.data.acknowledged !== true) {
        res.status(400).json({
          error: "You must accept the electronic-signature acknowledgment to sign.",
        });
        return;
      }

      const [existing] = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.id, requestId))
        .limit(1);

      if (!existing || existing.employeeId !== req.dbUser!.id) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      const { sessionId } = getAuth(req);
      const [guarantee] = await db
        .insert(repaymentGuarantees)
        .values({
          requestId,
          employeeId: req.dbUser!.id,
          signedName,
          signedDate: parsed.data.signedDate ?? null,
          email: req.dbUser!.email,
          ipAddress: req.ip ?? null,
          sessionId: sessionId ?? null,
          acknowledged: true,
        })
        .returning();

      res.status(201).json({
        id: guarantee.id,
        requestId: guarantee.requestId,
        employeeId: guarantee.employeeId,
        signedName: guarantee.signedName,
        signedDate: guarantee.signedDate ?? null,
        signedAt: guarantee.signedAt.toISOString(),
        acknowledged: guarantee.acknowledged,
        email: guarantee.email ?? null,
        ipAddress: guarantee.ipAddress ?? null,
        sessionId: guarantee.sessionId ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "signRepaymentGuarantee error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/requests/:requestId/receipts
router.get(
  "/requests/:requestId/receipts",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const user = req.dbUser!;

      // Verify access: fetch the parent request first
      const [parent] = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.id, requestId))
        .limit(1);

      if (!parent) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      // Employee can only see their own receipts
      if (user.role === "employee" && parent.employeeId !== user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Manager can only see their clinic's employees' receipts
      if (user.role === "manager") {
        if (parent.employeeId === user.id) {
          const rows = await db
            .select()
            .from(receipts)
            .where(eq(receipts.requestId, requestId));

          res.json(
            rows.map((r) => ({
              id: r.id,
              requestId: r.requestId,
              fileUrl: r.fileUrl,
              fileName: r.fileName ?? null,
              uploadedAt: r.uploadedAt.toISOString(),
            })),
          );
          return;
        }
        if (!user.clinicId) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        const [emp] = await db
          .select({ clinicId: users.clinicId })
          .from(users)
          .where(eq(users.id, parent.employeeId))
          .limit(1);
        if (!emp || emp.clinicId !== user.clinicId) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }

      const rows = await db
        .select()
        .from(receipts)
        .where(eq(receipts.requestId, requestId));

      res.json(
        rows.map((r) => ({
          id: r.id,
          requestId: r.requestId,
          fileUrl: r.fileUrl,
          fileName: r.fileName ?? null,
          uploadedAt: r.uploadedAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error({ err }, "listReceipts error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/requests/:requestId/receipts
router.post(
  "/requests/:requestId/receipts",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const parsed = SubmitReceiptBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "File URL required" });
        return;
      }

      const [existing] = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.id, requestId))
        .limit(1);

      if (!existing || existing.employeeId !== req.dbUser!.id) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      // Only allowed once BO has approved
      if (existing.status !== "awaiting_receipt") {
        res.status(400).json({ error: "Receipt can only be submitted once the Business Office has approved this request" });
        return;
      }

      const expectedPathPrefix = `/objects/uploads/requests/${requestId}/`;
      if (!parsed.data.fileUrl.startsWith(expectedPathPrefix)) {
        res.status(400).json({ error: "Receipt upload is not valid for this request" });
        return;
      }

      let uploadedObject;
      try {
        uploadedObject = await objectStorageService.getObjectEntityFile(parsed.data.fileUrl);
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          res.status(400).json({ error: "Uploaded receipt file was not found" });
          return;
        }
        throw error;
      }
      const [metadata] = await uploadedObject.getMetadata();
      const storedSize = Number(metadata.size ?? 0);
      const [header] = await uploadedObject.download({ start: 0, end: 15 });
      const detectedType = detectReceiptType(header);

      if (
        storedSize < 1 ||
        storedSize > MAX_RECEIPT_SIZE_BYTES ||
        !detectedType ||
        !receiptNameMatchesType(parsed.data.fileName, detectedType)
      ) {
        await uploadedObject.delete({ ignoreNotFound: true }).catch(() => undefined);
        res.status(400).json({
          error: "Receipt must be a valid PDF, JPG, or PNG file no larger than 10 MB",
        });
        return;
      }

      const receipt = await db.transaction(async (tx) => {
        const [createdReceipt] = await tx
          .insert(receipts)
          .values({
            requestId,
            fileUrl: parsed.data.fileUrl,
            fileName: parsed.data.fileName ?? null,
          })
          .returning();

        await tx
          .update(conEdRequests)
          .set({ status: "receipt_submitted", updatedAt: new Date() })
          .where(eq(conEdRequests.id, requestId));

        return createdReceipt;
      });

      res.status(201).json({
        id: receipt.id,
        requestId: receipt.requestId,
        fileUrl: receipt.fileUrl,
        fileName: receipt.fileName ?? null,
        uploadedAt: receipt.uploadedAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "submitReceipt error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/requests/:requestId/reimburse
router.post(
  "/requests/:requestId/reimburse",
  requireRole("accounting", "admin"),
  async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId as string);
      const parsed = MarkReimbursedBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "A valid reimbursement amount and paycheck date are required" });
        return;
      }

      // Verify request exists and is in receipt_submitted status
      const [existingReq] = await db
        .select()
        .from(conEdRequests)
        .where(eq(conEdRequests.id, requestId))
        .limit(1);

      if (!existingReq) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      if (existingReq.status !== "receipt_submitted") {
        res.status(400).json({ error: "Request must have a submitted receipt before reimbursement" });
        return;
      }

      const [submittedReceipt] = await db
        .select({ id: receipts.id })
        .from(receipts)
        .where(eq(receipts.requestId, requestId))
        .limit(1);
      if (!submittedReceipt) {
        res.status(400).json({ error: "A receipt file is required before reimbursement" });
        return;
      }

      const approvedAmount = parseFloat(
        existingReq.totalApproved ?? existingReq.totalRequested,
      );
      if (parsed.data.amount > approvedAmount) {
        res.status(400).json({
          error: "Reimbursement amount cannot exceed the Business Office approved total",
        });
        return;
      }

      const reimb = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(reimbursements)
          .values({
            requestId,
            amount: String(parsed.data.amount),
            paycheckDate: parsed.data.paycheckDate as unknown as string,
            markedById: req.dbUser!.id,
          })
          .returning();

        await tx
          .update(conEdRequests)
          .set({ status: "reimbursed", updatedAt: new Date() })
          .where(eq(conEdRequests.id, requestId));

        return created;
      });

      res.status(201).json({
        id: reimb.id,
        requestId: reimb.requestId,
        amount: reimb.amount ? parseFloat(reimb.amount) : null,
        paycheckDate: reimb.paycheckDate,
        markedById: reimb.markedById ?? null,
        markedByName: req.dbUser!.name,
        markedAt: reimb.markedAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "markReimbursed error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
