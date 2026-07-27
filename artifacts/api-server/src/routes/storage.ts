import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../lib/auth";
import { ALLOWED_RECEIPT_TYPES, MAX_RECEIPT_SIZE_BYTES } from "../lib/receiptFiles";
import { db } from "@workspace/db";
import { receipts, conEdRequests, users } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
function safeDownloadName(fileName: string | null): string {
  return (
    (fileName || "receipt")
      .replace(/[\r\n"]/g, "")
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 180) || "receipt"
  );
}

function receiptContentType(fileName: string | null): string {
  const normalized = (fileName ?? "").trim().toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { requestId, name, size, contentType } = parsed.data;
    const caller = req.dbUser!;

    if (caller.role !== "employee" && caller.role !== "manager") {
      res.status(403).json({ error: "Only the request owner can upload a receipt" });
      return;
    }
    if (!ALLOWED_RECEIPT_TYPES.has(contentType)) {
      res.status(400).json({ error: "Receipt must be a PDF, JPG, or PNG file" });
      return;
    }
    if (size > MAX_RECEIPT_SIZE_BYTES) {
      res.status(400).json({ error: "Receipt must be 10 MB or smaller" });
      return;
    }

    const [eligibleRequest] = await db
      .select({ id: conEdRequests.id })
      .from(conEdRequests)
      .where(
        and(
          eq(conEdRequests.id, requestId),
          eq(conEdRequests.employeeId, caller.id),
          eq(conEdRequests.status, "awaiting_receipt"),
        ),
      )
      .limit(1);

    if (!eligibleRequest) {
      res.status(403).json({
        error: "Receipt upload is only available to the owner after final approval",
      });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL(requestId);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { requestId, name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

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

router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const caller = req.dbUser!;
    const [receipt] = await db
      .select({ requestId: receipts.requestId, fileName: receipts.fileName })
      .from(receipts)
      .where(eq(receipts.fileUrl, objectPath))
      .limit(1);

    if (!receipt) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (caller.role === "employee" || caller.role === "manager") {
      const [parentRequest] = await db
        .select({ employeeId: conEdRequests.employeeId })
        .from(conEdRequests)
        .where(eq(conEdRequests.id, receipt.requestId))
        .limit(1);

      if (!parentRequest) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (caller.role === "employee" && parentRequest.employeeId !== caller.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (caller.role === "manager") {
        const [employee] = await db
          .select({ clinicId: users.clinicId })
          .from(users)
          .where(eq(users.id, parentRequest.employeeId))
          .limit(1);
        if (!employee || employee.clinicId !== caller.clinicId) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const contentType = receiptContentType(receipt.fileName);
    const disposition =
      req.query.disposition === "inline" && contentType !== "application/octet-stream"
        ? "inline"
        : "attachment";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeDownloadName(receipt.fileName)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
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
