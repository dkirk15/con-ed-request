import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_COLORS[status] || "default";
  const label = STATUS_LABELS[status] || status;

  if (status === "reimbursed") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-sidebar text-sidebar-foreground"
      >
        {label}
      </Badge>
    );
  }

  return <Badge variant={variant as any}>{label}</Badge>;
}
