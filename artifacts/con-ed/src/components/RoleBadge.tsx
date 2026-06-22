import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";

export function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] || role;
  
  let variant: "default" | "secondary" | "outline" | "destructive" = "outline";
  if (role === "admin") variant = "destructive";
  if (role === "manager" || role === "business_office" || role === "accounting") variant = "default";
  
  return <Badge variant={variant}>{label}</Badge>;
}
