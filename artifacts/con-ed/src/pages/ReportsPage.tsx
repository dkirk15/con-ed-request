import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  type GetReportParams,
  type ReportOrderParameter,
  type ReportSortParameter,
  customFetch,
  getGetReportOptionsQueryKey,
  getGetReportQueryKey,
  useGetMe,
  useGetReport,
  useGetReportOptions,
} from "@workspace/api-client-react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  Search,
  WalletCards,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import {
  DELIVERY_METHOD_LABELS,
  STATUS_LABELS,
  formatCourseDateRange,
  formatCurrency,
  formatDate,
} from "@/lib/constants";

const REPORT_ROLES = new Set(["manager", "business_office", "accounting", "admin"]);
const STATUS_OPTIONS = Object.entries(STATUS_LABELS);
const CURRENT_YEAR = new Date().getFullYear();

function numericParam(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function downloadName(responseYear: number) {
  return `oss-ce-report-${responseYear}.csv`;
}

export default function ReportsPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const canView = Boolean(user && REPORT_ROLES.has(user.role));
  const year = numericParam(searchParams, "year") ?? CURRENT_YEAR;
  const page = numericParam(searchParams, "page") ?? 1;
  const pageSize = numericParam(searchParams, "pageSize") ?? 25;
  const searchValue = searchParams.get("search") ?? "";
  const deferredSearch = useDeferredValue(searchValue);

  const reportParams = useMemo<GetReportParams>(() => ({
    year,
    clinicId: numericParam(searchParams, "clinicId"),
    employeeId: numericParam(searchParams, "employeeId"),
    status: (searchParams.get("status") || undefined) as GetReportParams["status"],
    deliveryMethod: (searchParams.get("deliveryMethod") || undefined) as GetReportParams["deliveryMethod"],
    search: deferredSearch || undefined,
    courseFrom: searchParams.get("courseFrom") || undefined,
    courseTo: searchParams.get("courseTo") || undefined,
    sort: (searchParams.get("sort") || "createdAt") as ReportSortParameter,
    order: (searchParams.get("order") || "desc") as ReportOrderParameter,
    page,
    pageSize,
  }), [deferredSearch, page, pageSize, searchParams, year]);

  const optionsQuery = useGetReportOptions({
    query: { enabled: canView, queryKey: getGetReportOptionsQueryKey() },
  });
  const reportQuery = useGetReport(reportParams, {
    query: { enabled: canView, queryKey: getGetReportQueryKey(reportParams) },
  });
  const report = reportQuery.data;
  const options = optionsQuery.data;

  const updateFilters = (updates: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "" || value === "all") next.delete(key);
      else next.set(key, String(value));
    });
    if (!("page" in updates)) next.delete("page");
    setSearchParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    next.set("year", String(CURRENT_YEAR));
    setSearchParams(next);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const exportParams = new URLSearchParams();
      Object.entries(reportParams).forEach(([key, value]) => {
        if (key !== "page" && key !== "pageSize" && value != null && value !== "") {
          exportParams.set(key, String(value));
        }
      });
      const blob = await customFetch<Blob>(`/api/reports/export?${exportParams.toString()}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName(year);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Report exported", description: `Downloaded ${downloadName(year)}.` });
    } catch (error) {
      toast({
        title: "Report was not exported",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  if (userLoading) return <ReportsSkeleton />;

  if (!canView) {
    return (
      <Card className="mx-auto max-w-xl border-slate-200">
        <CardHeader><CardTitle>Reports are not available for this account</CardTitle></CardHeader>
        <CardContent><Button asChild><Link href="/dashboard">Return to overview</Link></Button></CardContent>
      </Card>
    );
  }

  const activeFilterCount = [
    reportParams.clinicId,
    reportParams.employeeId,
    reportParams.status,
    reportParams.deliveryMethod,
    reportParams.search,
    reportParams.courseFrom,
    reportParams.courseTo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            <BarChart3 className="h-4 w-4" aria-hidden="true" /> Operational reporting
          </div>
          <h1 className="mt-1 font-serif text-3xl font-bold text-slate-950">Funding and workflow reports</h1>
          <p className="mt-1 text-slate-500">
            {user?.role === "manager"
              ? `Clinic-scoped activity for ${user.clinicName || "your assigned clinic"}.`
              : "Organization-wide CE requests, approvals, receipts, and reimbursements."}
          </p>
        </div>
        <Button onClick={exportCsv} disabled={exporting || reportQuery.isLoading}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {exporting ? "Exporting" : "Export CSV"}
        </Button>
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="font-serif text-lg">Report filters</CardTitle>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX className="h-4 w-4" aria-hidden="true" /> Clear {activeFilterCount}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label="Calendar year"
            value={String(year)}
            onChange={(value) => updateFilters({ year: value })}
            options={(options?.years?.length ? options.years : [CURRENT_YEAR]).map((value) => [String(value), String(value)])}
          />
          {user?.role !== "manager" && (
            <FilterSelect
              label="Clinic"
              value={reportParams.clinicId ? String(reportParams.clinicId) : "all"}
              onChange={(value) => updateFilters({ clinicId: value, employeeId: null })}
              options={[["all", "All clinics"], ...(options?.clinics ?? []).map((clinic) => [String(clinic.id), clinic.name] as [string, string])]}
            />
          )}
          <FilterSelect
            label="Employee"
            value={reportParams.employeeId ? String(reportParams.employeeId) : "all"}
            onChange={(value) => updateFilters({ employeeId: value })}
            options={[
              ["all", "All employees"],
              ...(options?.employees ?? [])
                  .filter((employee) => !reportParams.clinicId || employee.clinicId === reportParams.clinicId)
                .map((employee) => [String(employee.id), `${employee.name}${employee.clinicName ? ` - ${employee.clinicName}` : ""}`] as [string, string]),
            ]}
          />
          <FilterSelect
            label="Status"
            value={reportParams.status ?? "all"}
            onChange={(value) => updateFilters({ status: value })}
            options={[["all", "All statuses"], ...STATUS_OPTIONS]}
          />
          <FilterSelect
            label="Delivery method"
            value={reportParams.deliveryMethod ?? "all"}
            onChange={(value) => updateFilters({ deliveryMethod: value })}
            options={[["all", "All delivery methods"], ...Object.entries(DELIVERY_METHOD_LABELS)]}
          />
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            <span>Course date from</span>
            <Input type="date" value={reportParams.courseFrom ?? ""} onChange={(event) => updateFilters({ courseFrom: event.target.value })} />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            <span>Course date through</span>
            <Input type="date" value={reportParams.courseTo ?? ""} onChange={(event) => updateFilters({ courseTo: event.target.value })} />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            <span>Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={searchValue}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder="Course, provider, or employee"
                className="pl-9"
              />
            </div>
          </label>
        </CardContent>
      </Card>

      {reportQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Report could not be loaded</AlertTitle>
          <AlertDescription>{reportQuery.error instanceof Error ? reportQuery.error.message : "Refresh and try again."}</AlertDescription>
        </Alert>
      ) : reportQuery.isLoading || !report ? (
        <ReportBodySkeleton />
      ) : (
        <>
          <section className="grid overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="Financial summary">
            <Metric label="Requested" value={formatCurrency(report.summary.totalRequested)} detail={`${report.summary.totalRequests} requests`} />
            <Metric label="Approved" value={formatCurrency(report.summary.totalApproved)} detail="Final CE approvals" />
            <Metric label="Reimbursed" value={formatCurrency(report.summary.totalReimbursed)} detail="Actual payments recorded" />
            <Metric label="Outstanding" value={formatCurrency(report.summary.outstandingApproved)} detail="Approved, not yet reimbursed" emphasis={report.summary.outstandingApproved > 0} />
          </section>

          <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" aria-labelledby="workflow-health-heading">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="workflow-health-heading" className="font-serif text-lg font-bold text-slate-950">Workflow health</h2>
                <p className="mt-0.5 text-sm text-slate-500">Current work and the age of the oldest item in each queue.</p>
              </div>
              <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4">
              {report.workflow.map((stage) => (
                <div key={stage.status} className="border-b border-slate-200 p-5 last:border-b-0 sm:border-r xl:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-600">{stage.label}</span>
                    <Badge variant={stage.count > 0 ? "secondary" : "outline"}>{stage.count}</Badge>
                  </div>
                  <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950">
                    {stage.oldestDays == null ? "Clear" : `${stage.oldestDays}d`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{stage.oldestDays == null ? "No items waiting" : "Oldest item waiting"}</div>
                </div>
              ))}
            </div>
          </section>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="font-serif text-lg">Request ledger</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">{report.total} matching requests</p>
                </div>
                <div className="flex items-center gap-2">
                  <FilterSelect
                    label="Sort requests"
                    hideLabel
                    value={reportParams.sort ?? "createdAt"}
                    onChange={(value) => updateFilters({ sort: value })}
                    options={[
                      ["createdAt", "Request date"],
                      ["courseStartDate", "Course date"],
                      ["employeeName", "Employee"],
                      ["totalRequested", "Requested amount"],
                      ["totalApproved", "Approved amount"],
                      ["status", "Status"],
                    ]}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={reportParams.order === "asc" ? "Sort descending" : "Sort ascending"}
                    onClick={() => updateFilters({ order: reportParams.order === "asc" ? "desc" : "asc" })}
                  >
                    {reportParams.order === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Course</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Reimbursed</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.items.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="h-36 text-center text-slate-500">No requests match these filters.</TableCell></TableRow>
                  ) : report.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-72">
                        <Link href={`/requests/${row.id}`} className="font-medium text-slate-950 hover:text-primary hover:underline">{row.courseName}</Link>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {formatCourseDateRange(row.courseStartDate, row.courseEndDate, row.legacyCourseDates)}
                          {row.courseProvider ? ` | ${row.courseProvider}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-800">{row.employeeName}</div>
                        <div className="text-xs text-slate-500">{row.clinicName || "No clinic"}</div>
                      </TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.totalRequested)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.totalApproved == null ? "--" : formatCurrency(row.totalApproved)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.reimbursementAmount == null ? "--" : formatCurrency(row.reimbursementAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-500">{formatDate(row.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <WalletCards className="h-4 w-4" aria-hidden="true" /> Page {report.page} of {report.totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <FilterSelect
                    label="Rows per page"
                    hideLabel
                    value={String(pageSize)}
                    onChange={(value) => updateFilters({ pageSize: value, page: 1 })}
                    options={[["25", "25 rows"], ["50", "50 rows"], ["100", "100 rows"]]}
                  />
                  <Button variant="outline" size="icon" aria-label="Previous page" disabled={report.page <= 1} onClick={() => updateFilters({ page: report.page - 1 })}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Next page" disabled={report.page >= report.totalPages} onClick={() => updateFilters({ page: report.page + 1 })}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  hideLabel?: boolean;
}) {
  return (
    <label className={hideLabel ? "" : "space-y-1.5 text-sm font-medium text-slate-700"}>
      {!hideLabel && <span>{label}</span>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="bg-white"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

function Metric({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return (
    <div className="border-b border-slate-200 p-5 last:border-b-0 sm:border-r xl:border-b-0">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${emphasis ? "text-amber-700" : "text-slate-950"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function ReportsSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-56 w-full" /><ReportBodySkeleton /></div>;
}

function ReportBodySkeleton() {
  return <div className="space-y-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-44 w-full" /><Skeleton className="h-96 w-full" /></div>;
}
