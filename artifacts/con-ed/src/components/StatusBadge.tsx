import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_COLORS[status] || "default";
  const label = STATUS_LABELS[status] || status;

  return <Badge variant={variant as any}>{label}</Badge>;
}
