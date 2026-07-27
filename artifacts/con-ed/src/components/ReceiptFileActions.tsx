import { useEffect, useState } from "react";
import { Download, ExternalLink, Eye, FileText, Loader2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export type ReceiptFile = {
  id: number;
  fileUrl: string;
  fileName?: string | null;
};

export function ReceiptFileActions({ receipt }: { receipt: ReceiptFile }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  const fileName = receipt.fileName || `receipt-${receipt.id}`;
  const isPdf = fileName.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    if (!previewOpen) return;

    let cancelled = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setLoadError(null);

    customFetch<Blob>(`/api/storage${receipt.fileUrl}?disposition=inline`, {
      responseType: "blob",
    })
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "The receipt could not be loaded.");
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewOpen, receipt.fileUrl]);

  const downloadBlob = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadReceipt = async () => {
    if (objectUrl) {
      downloadBlob(objectUrl);
      return;
    }

    setDownloading(true);
    try {
      const blob = await customFetch<Blob>(`/api/storage${receipt.fileUrl}`, {
        responseType: "blob",
      });
      const downloadUrl = URL.createObjectURL(blob);
      downloadBlob(downloadUrl);
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
    } catch (error) {
      toast({
        title: "Receipt could not be downloaded",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setPreviewOpen(true)}>
          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
          View receipt
        </Button>
        <Button variant="outline" size="sm" disabled={downloading} onClick={downloadReceipt}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Download
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[85vh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-4">
            <DialogTitle>Receipt preview</DialogTitle>
            <DialogDescription className="truncate">{fileName}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-slate-100 p-4">
            {!objectUrl && !loadError ? (
              <div className="flex h-full items-center justify-center text-slate-600" role="status">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                Loading receipt…
              </div>
            ) : loadError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <FileText className="h-10 w-10 text-slate-400" aria-hidden="true" />
                <p className="font-medium text-slate-900">Receipt preview unavailable</p>
                <p className="max-w-md text-sm text-slate-600">{loadError}</p>
              </div>
            ) : isPdf ? (
              <iframe
                src={objectUrl ?? undefined}
                title={`Receipt preview: ${fileName}`}
                className="h-full w-full rounded-md border border-slate-200 bg-white"
              />
            ) : (
              <div className="flex h-full items-center justify-center overflow-auto">
                <img
                  src={objectUrl ?? undefined}
                  alt={`Receipt preview: ${fileName}`}
                  className="max-h-full max-w-full rounded-md bg-white object-contain shadow-sm"
                />
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button
              variant="outline"
              disabled={!objectUrl}
              onClick={() => objectUrl && window.open(objectUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              Open in new tab
            </Button>
            <Button disabled={!objectUrl} onClick={() => objectUrl && downloadBlob(objectUrl)}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
