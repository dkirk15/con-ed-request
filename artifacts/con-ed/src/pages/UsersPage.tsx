import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  type ListUsersParams,
  useGetMe,
  useListClinics,
  useListUsers,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleBadge } from "@/components/RoleBadge";
import { RepaymentGuaranteeDialog } from "@/components/RepaymentGuaranteeDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS } from "@/lib/constants";
import { FileSignature, Search, Users as UsersIcon, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function UsersPage() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const { data: clinics } = useListClinics();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const role = searchParams.get("role");
  const clinicId = searchParams.get("clinicId");

  useEffect(() => {
    setSearchValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  const { data: users, isLoading } = useListUsers({
    ...(isAdmin && role ? { role: role as ListUsersParams["role"] } : {}),
    ...(isAdmin && clinicId ? { clinicId: Number(clinicId) } : {}),
  });

  const filteredUsers = useMemo(() => {
    const query = (searchParams.get("search") ?? "").trim().toLowerCase();
    if (!query) return users ?? [];
    return (users ?? []).filter((user) =>
      [user.name, user.email, user.clinicName, user.managerName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [searchParams, users]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchValue.trim() || null });
  };

  const hasFilters = Boolean(role || clinicId || searchParams.get("search"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? "Administration" : "Clinic"}
        title={isAdmin ? "People" : "Team"}
        description={
          isAdmin
            ? "Manage staff access, assignments, and CE configuration."
            : "View employees and managers assigned to your clinic."
        }
      />

      <section
        aria-label="People filters"
        className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm"
      >
        <form onSubmit={submitSearch} className="min-w-64 flex-1">
          <label htmlFor="people-search" className="mb-1.5 block text-xs font-medium text-slate-600">
            Search
          </label>
          <div className="flex">
            <Input
              id="people-search"
              name="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Name, email, clinic, or manager…"
              className="rounded-r-none"
              autoComplete="off"
            />
            <Button type="submit" variant="outline" className="-ml-px rounded-l-none" aria-label="Search people">
              <Search aria-hidden="true" />
            </Button>
          </div>
        </form>

        {isAdmin && (
          <>
            <FilterSelect
              label="Role"
              value={role ?? "all"}
              onChange={(value) => updateParams({ role: value })}
              options={[
                ["all", "All Roles"],
                ...Object.entries(ROLE_LABELS),
              ]}
            />
            <FilterSelect
              label="Clinic"
              value={clinicId ?? "all"}
              onChange={(value) => updateParams({ clinicId: value })}
              options={[
                ["all", "All Clinics"],
                ...(clinics ?? []).map(
                  (clinic) => [String(clinic.id), clinic.name] as [string, string],
                ),
              ]}
              width="w-52"
            />
          </>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5 text-slate-500"
            onClick={() => {
              setSearchValue("");
              setSearchParams(new URLSearchParams(), { replace: true });
            }}
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        )}
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600" aria-live="polite">
          {isLoading
            ? "Loading people…"
            : `${filteredUsers.length} ${filteredUsers.length === 1 ? "person" : "people"}`}
        </div>
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Clinic</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Repayment Agreement</TableHead>
              {isAdmin && <TableHead className="w-24 text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                  {isAdmin && <TableCell><Skeleton className="ml-auto h-8 w-16" /></TableCell>}
                </TableRow>
              ))
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} className="h-56 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="mb-3 rounded-full bg-slate-100 p-3">
                      <UsersIcon aria-hidden="true" className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-900">No matching people</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Adjust the filters or search terms to see more results.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-slate-50/70">
                  <TableCell className="font-medium text-slate-950">{user.name}</TableCell>
                  <TableCell className="text-slate-600">{user.email}</TableCell>
                  <TableCell><RoleBadge role={user.role} /></TableCell>
                  <TableCell>{user.clinicName || "—"}</TableCell>
                  <TableCell>{user.managerName || "—"}</TableCell>
                  <TableCell>
                    {user.repaymentGuarantees?.length ? (
                      <RepaymentGuaranteeDialog guarantees={user.repaymentGuarantees}>
                        <Button variant="outline" size="sm">
                          <FileSignature aria-hidden="true" className="h-3.5 w-3.5" />
                          View{user.repaymentGuarantees.length > 1 ? ` (${user.repaymentGuarantees.length})` : ""}
                        </Button>
                      </RepaymentGuaranteeDialog>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/users/${user.id}`}>Edit</Link>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  width = "w-44",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  width?: string;
}) {
  return (
    <div className={width}>
      <label className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
