import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  pending_manager: "border-amber-200 bg-amber-50 text-amber-800",
  manager_approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  manager_denied: "border-red-200 bg-red-50 text-red-700",
  pending_bo: "border-orange-200 bg-orange-50 text-orange-800",
  bo_approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  bo_denied: "border-red-200 bg-red-50 text-red-700",
  awaiting_receipt: "border-sky-200 bg-sky-50 text-sky-800",
  receipt_submitted: "border-indigo-200 bg-indigo-50 text-indigo-800",
  reimbursed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;

  return (
    <Badge
      variant="outline"
      className={cn("shadow-none hover:shadow-none", STATUS_STYLES[status])}
    >
      {label}
    </Badge>
  );
}
