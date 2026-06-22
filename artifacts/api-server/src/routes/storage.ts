import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { receipts, conEdRequests, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload (authenticated users only).
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS (no auth required).
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities (receipts). Requires authentication and
 * enforces ownership/role checks by looking up the file URL in the receipts table.
 *
 * Access rules:
 * - Employee: may access receipts on their own requests
 * - Manager: may access receipts on requests from their clinic's employees
 * - Business Office / Accounting / Admin: unrestricted
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const caller = req.dbUser!;

    // Only perform receipt ownership checks for employee and manager roles
    if (caller.role === "employee" || caller.role === "manager") {
      // Reconstruct the fileUrl that would be stored in the receipts table
      // The fileUrl stored is the presigned upload URL; we match on objectPath suffix
      const matchingReceipts = await db
        .select({ requestId: receipts.requestId })
        .from(receipts)
        .where(
          // fileUrl contains the objectPath; use LIKE or exact match depending on storage convention
          // We use a partial match on the path segment
          eq(receipts.fileUrl, objectPath),
        );

      // If no exact match, try a broader lookup — receipts.fileUrl may be the full presigned URL
      // In that case fall back to allowing access for any authenticated user (least-privilege approach)
      if (matchingReceipts.length > 0) {
        const requestId = matchingReceipts[0].requestId;

        const [parentReq] = await db
          .select({ employeeId: conEdRequests.employeeId })
          .from(conEdRequests)
          .where(eq(conEdRequests.id, requestId))
          .limit(1);

        if (!parentReq) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        if (caller.role === "employee" && parentReq.employeeId !== caller.id) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        if (caller.role === "manager") {
          const [emp] = await db
            .select({ clinicId: users.clinicId })
            .from(users)
            .where(eq(users.id, parentReq.employeeId))
            .limit(1);
          if (!emp || emp.clinicId !== caller.clinicId) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
        }
      }
      // If no receipt record found, deny both employees and managers
      else {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    // business_office, accounting, admin pass through

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
