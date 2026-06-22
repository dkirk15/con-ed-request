import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useImpersonation, type ImpersonableRole } from "@/context/ImpersonationContext";
import { useGetMe } from "@workspace/api-client-react";

const ROLES: { value: ImpersonableRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "business_office", label: "Business Office" },
  { value: "accounting", label: "Accounting" },
];

export default function ImpersonationBanner() {
  const { impersonatedRole, setImpersonatedRole } = useImpersonation();
  const { data: me } = useGetMe();

  const isAdmin = impersonatedRole !== null || me?.role === "admin";
  if (!isAdmin) return null;

  return (
    <div className="bg-amber-950 text-amber-100 px-4 py-2 flex items-center gap-3 text-sm shrink-0">
      <FlaskConical className="h-4 w-4 text-amber-400 shrink-0" />
      <span className="text-amber-300 font-medium shrink-0">Admin test mode</span>
      <span className="text-amber-500 shrink-0">—</span>
      <span className="text-amber-400 shrink-0">View app as:</span>
      <Select
        value={impersonatedRole ?? "admin"}
        onValueChange={(val) =>
          setImpersonatedRole(val === "admin" ? null : (val as ImpersonableRole))
        }
      >
        <SelectTrigger className="h-7 w-44 bg-amber-900 border-amber-700 text-amber-100 text-xs focus:ring-amber-600">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin (default)</SelectItem>
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {impersonatedRole && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-amber-300 hover:text-amber-100 hover:bg-amber-800 ml-auto"
          onClick={() => setImpersonatedRole(null)}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Exit
        </Button>
      )}
    </div>
  );
}
