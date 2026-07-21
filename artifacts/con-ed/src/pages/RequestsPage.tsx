import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  type ListRequestsParams,
  useGetMe,
  useListClinics,
  useListRequests,
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/constants";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";

type Role = "employee" | "manager" | "business_office" | "accounting" | "admin";
type QueueLink = { label: string; href: string; matches: Record<string, string> };

const STATUS_OPTIONS = [
  ["all", "All Statuses"],
  ["draft", "Draft"],
  ["pending_manager", "Pending Manager Approval"],
  ["manager_denied", "Manager Denied"],
  ["pending_bo", "Pending CE Approval"],
  ["bo_denied", "CE Denied"],
  ["awaiting_receipt", "Awaiting Receipt"],
  ["receipt_submitted", "Receipt Submitted"],
  ["reimbursed", "Reimbursed"],
  ["cancelled", "Cancelled"],
] as const;

const QUEUES: Record<Role, QueueLink[]> = {
  employee: [
    { label: "All Requests", href: "/requests", matches: {} },
    { label: "Drafts", href: "/requests?status=draft", matches: { status: "draft" } },
    {
      label: "Upload Receipts",
      href: "/requests?status=awaiting_receipt",
      matches: { status: "awaiting_receipt" },
    },
    {
      label: "Completed",
      href: "/requests?status=reimbursed",
      matches: { status: "reimbursed" },
    },
  ],
  manager: [
    {
      label: "Needs My Approval",
      href: "/approvals",
      matches: { workspace: "approvals" },
    },
    {
      label: "My Requests",
      href: "/requests?scope=mine",
      matches: { scope: "mine" },
    },
    { label: "Clinic Requests", href: "/requests", matches: {} },
  ],
  business_office: [
    {
      label: "Needs CE Approval",
      href: "/approvals",
      matches: { workspace: "approvals" },
    },
    {
      label: "Awaiting Receipts",
      href: "/requests?status=awaiting_receipt",
      matches: { status: "awaiting_receipt" },
    },
    { label: "All Requests", href: "/requests", matches: {} },
  ],
  accounting: [
    {
      label: "Ready to Reimburse",
      href: "/reimbursements",
      matches: { workspace: "reimbursements" },
    },
    {
      label: "Reimbursement History",
      href: "/requests?status=reimbursed",
      matches: { status: "reimbursed" },
    },
    { label: "All Requests", href: "/requests", matches: {} },
  ],
  admin: [
    { label: "All Requests", href: "/requests", matches: {} },
    {
      label: "Manager Queue",
      href: "/requests?status=pending_manager",
      matches: { status: "pending_manager" },
    },
    {
      label: "CE Queue",
      href: "/requests?status=pending_bo",
      matches: { status: "pending_bo" },
    },
    {
      label: "Reimbursement Queue",
      href: "/requests?status=receipt_submitted",
      matches: { status: "receipt_submitted" },
    },
  ],
};

function pageCopy(role: Role, status: string | null, scope: string | null) {
  if (role === "employee") {
    return {
      title: "My Requests",
      description: "Track funding requests from draft through reimbursement.",
    };
  }
  if (role === "manager") {
    if (scope === "mine") {
      return {
        title: "My Requests",
        description: "Track the continuing education requests you submitted.",
      };
    }
    return {
      title: status === "pending_manager" ? "Approval Queue" : "Clinic Requests",
      description: "Review submitted requests from employees in your clinic.",
    };
  }
  if (role === "business_office") {
    return {
      title: status === "pending_bo" ? "CE Approval Queue" : "CE Requests",
      description: "Review funding decisions and monitor approved requests.",
    };
  }
  if (role === "accounting") {
    return {
      title: status === "reimbursed" ? "Reimbursement History" : "Reimbursements",
      description: "Process approved requests with submitted receipts.",
    };
  }
  return {
    title: "All Requests",
    description: "Monitor the complete continuing education workflow.",
  };
}

function isQueueActive(queue: QueueLink, params: URLSearchParams): boolean {
  if (queue.matches.workspace) return false;
  const tracked = ["status", "scope"];
  return tracked.every((key) => {
    const expected = queue.matches[key] ?? null;
    return params.get(key) === expected;
  });
}

function requestActionLabel(role: Role, status: string, canEditDraft: boolean) {
  if (canEditDraft) return "Continue editing";
  if (role === "manager" && status === "pending_manager") return "Review";
  if ((role === "business_office" || role === "admin") && status === "pending_bo") return "Review";
  if ((role === "accounting" || role === "admin") && status === "receipt_submitted") return "Process";
  return "View";
}

function requestHref(
  request: { id: number; status: string; employeeId: number },
  currentUserId?: number,
) {
  return request.status === "draft" && request.employeeId === currentUserId
    ? `/requests/${request.id}/edit`
    : `/requests/${request.id}`;
}

function requestActionHref(
  request: { id: number; status: string; employeeId: number },
  role: Role,
  currentUserId?: number,
) {
  if (role === "manager" && request.status === "pending_manager") {
    return `/approvals?selected=${request.id}`;
  }
  if (role === "business_office" && request.status === "pending_bo") {
    return `/approvals?selected=${request.id}`;
  }
  if ((role === "accounting" || role === "admin") && request.status === "receipt_submitted") {
    return `/reimbursements?selected=${request.id}`;
  }
  return requestHref(request, currentUserId);
}

export default function RequestsPage() {
  const { data: user } = useGetMe();
  const role = (user?.role ?? "employee") as Role;
  const showClinicFilter = ["business_office", "accounting", "admin"].includes(role);
  const { data: clinics } = useListClinics();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");

  useEffect(() => {
    setSearchValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  const status = searchParams.get("status");
  const scope = searchParams.get("scope");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Number(searchParams.get("pageSize") || "25");
  const sort = (searchParams.get("sort") || "updatedAt") as NonNullable<ListRequestsParams["sort"]>;
  const order = (searchParams.get("order") || "desc") as NonNullable<ListRequestsParams["order"]>;
  const copy = pageCopy(role, status, scope);

  const queryParams: ListRequestsParams = {
    page,
    pageSize,
    sort,
    order,
    ...(status ? { status: status as ListRequestsParams["status"] } : {}),
    ...(scope ? { scope: scope as ListRequestsParams["scope"] } : {}),
    ...(searchParams.get("search") ? { search: searchParams.get("search")! } : {}),
    ...(searchParams.get("clinicId")
      ? { clinicId: Number(searchParams.get("clinicId")) }
      : {}),
    ...(searchParams.get("year") ? { year: Number(searchParams.get("year")) } : {}),
  };

  const { data, error, isError, isLoading, isFetching, refetch } = useListRequests(queryParams);
  const requests = data?.items ?? [];
  const showEmployee = role !== "employee" && scope !== "mine";
  const currentYear = new Date().getFullYear();

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    }
    if (!Object.prototype.hasOwnProperty.call(updates, "page")) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchValue.trim() || null });
  };

  const clearFilters = () => {
    setSearchValue("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const hasFilters = Boolean(
    status ||
      scope ||
      searchParams.get("search") ||
      searchParams.get("clinicId") ||
      searchParams.get("year"),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Continuing Education
          </p>
          <h1 className="mt-1 text-3xl font-serif font-bold text-slate-950">{copy.title}</h1>
          <p className="mt-1 text-slate-500">{copy.description}</p>
        </div>
        {(role === "employee" || role === "manager") && (
          <Button asChild>
            <Link href="/requests/new">
              <Plus aria-hidden="true" />
              New Request
            </Link>
          </Button>
        )}
      </header>

      <nav aria-label="Request queues" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {QUEUES[role].map((queue) => (
          <Button
            key={queue.href}
            asChild
            size="sm"
            variant={isQueueActive(queue, searchParams) ? "secondary" : "ghost"}
            className={isQueueActive(queue, searchParams) ? "bg-secondary text-white" : ""}
          >
            <Link href={queue.href}>{queue.label}</Link>
          </Button>
        ))}
      </nav>

      <section
        aria-label="Request filters"
        className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={submitSearch} className="min-w-64 flex-1">
            <label htmlFor="request-search" className="mb-1.5 block text-xs font-medium text-slate-600">
              Search
            </label>
            <div className="flex">
              <Input
                id="request-search"
                name="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Course, employee, clinic, or location…"
                className="rounded-r-none"
                autoComplete="off"
              />
              <Button type="submit" variant="outline" className="-ml-px rounded-l-none" aria-label="Search requests">
                <Search aria-hidden="true" />
              </Button>
            </div>
          </form>

          <FilterSelect
            label="Status"
            value={status ?? "all"}
            onChange={(value) => updateParams({ status: value })}
            options={STATUS_OPTIONS}
          />

          {showClinicFilter && (
            <FilterSelect
              label="Clinic"
              value={searchParams.get("clinicId") ?? "all"}
              onChange={(value) => updateParams({ clinicId: value })}
              options={[
                ["all", "All Clinics"],
                ...(clinics ?? []).map((clinic) => [String(clinic.id), clinic.name] as const),
              ]}
              width="w-52"
            />
          )}

          <FilterSelect
            label="Year"
            value={searchParams.get("year") ?? "all"}
            onChange={(value) => updateParams({ year: value })}
            options={[
              ["all", "All Years"],
              ...Array.from({ length: 6 }, (_, index) => {
                const year = String(currentYear - index);
                return [year, year] as const;
              }),
            ]}
          />

          <FilterSelect
            label="Sort"
            value={`${sort}:${order}`}
            onChange={(value) => {
              const [nextSort, nextOrder] = value.split(":");
              updateParams({ sort: nextSort, order: nextOrder });
            }}
            options={[
              ["updatedAt:desc", "Recently Updated"],
              ["createdAt:desc", "Newest Submitted"],
              ["createdAt:asc", "Oldest Submitted"],
              ["totalRequested:desc", "Highest Amount"],
              ["totalRequested:asc", "Lowest Amount"],
              ["courseNames:asc", "Course A–Z"],
            ]}
            icon={<ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />}
            width="w-48"
          />

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="mb-0.5 text-slate-500">
              <X aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="text-sm text-slate-600" aria-live="polite">
            {isLoading ? "Loading requests…" : `${data?.total ?? 0} request${data?.total === 1 ? "" : "s"}`}
          </div>
          {isFetching && !isLoading && <span className="text-xs text-slate-400">Updating…</span>}
        </div>

        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Course</TableHead>
              {showEmployee && <TableHead>Employee</TableHead>}
              <TableHead>Requested</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-36 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-8 w-48" /></TableCell>
                  {showEmployee && <TableCell><Skeleton className="h-8 w-32" /></TableCell>}
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-8 w-16" /></TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={showEmployee ? 7 : 6} className="h-56 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <p className="font-medium text-slate-900">Requests could not be loaded</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {error instanceof Error
                        ? error.message
                        : "Check your connection and try again."}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
                      Try Again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showEmployee ? 7 : 6} className="h-64 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="mb-3 rounded-full bg-slate-100 p-3">
                      <FileText aria-hidden="true" className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-900">No matching requests</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {hasFilters
                        ? "Clear or adjust the filters to see more results."
                        : role === "employee"
                          ? "Create a request when you are ready to plan continuing education."
                          : "There is nothing waiting in this queue."}
                    </p>
                    {hasFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id} className="hover:bg-slate-50/70">
                  <TableCell className="max-w-80">
                    <Link
                      href={requestHref(request, user?.id)}
                      className="font-medium text-slate-950 hover:text-primary hover:underline"
                    >
                      {request.courseNames}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {request.courseDates || "Dates not provided"}
                    </div>
                  </TableCell>
                  {showEmployee && (
                    <TableCell>
                      <div className="font-medium text-slate-800">{request.employeeName}</div>
                      <div className="text-xs text-slate-500">{request.clinicName || "No clinic"}</div>
                    </TableCell>
                  )}
                  <TableCell className="tabular-nums">{formatCurrency(request.totalRequested)}</TableCell>
                  <TableCell className="tabular-nums">
                    {request.totalApproved != null ? formatCurrency(request.totalApproved) : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={request.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">
                    {formatDate(request.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={requestActionHref(request, role, user?.id)} className="whitespace-nowrap">
                        {requestActionLabel(
                          role,
                          request.status,
                          request.status === "draft" && request.employeeId === user?.id,
                        )}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {!isLoading && data && data.total > 0 && (
          <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => updateParams({ pageSize: value, page: "1" })}
              >
                <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                Page {data.page} of {data.totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous page"
                  disabled={data.page <= 1}
                  onClick={() => updateParams({ page: String(data.page - 1) })}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next page"
                  disabled={data.page >= data.totalPages}
                  onClick={() => updateParams({ page: String(data.page + 1) })}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          </footer>
        )}
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
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  width?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={width}>
      <label className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <span className="flex min-w-0 items-center gap-2">
            {icon}
            <SelectValue />
          </span>
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
