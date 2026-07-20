export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const TYPE_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export function detectReceiptType(bytes: Buffer): string | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

export function receiptNameMatchesType(fileName: string | null | undefined, type: string) {
  const normalized = (fileName ?? "").trim().toLowerCase();
  return (TYPE_EXTENSIONS[type] ?? []).some((extension) => normalized.endsWith(extension));
}
