import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  type GetReportParams,
  type ReportAdvancedRequest,
  type ReportBudgetRow,
  type ReportClinicComparison,
  type ReportOrderParameter,
  type ReportPaycheckBatch,
  type ReportResponse,
  type ReportRow,
  type ReportSortParameter,
  customFetch,
  getGetReportOptionsQueryKey,
  getGetReportQueryKey,
  useGetMe,
  useGetReport,
  useGetReportOptions,
} from "@workspace/api-client-react";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FilterX,
  Landmark,
  ListFilter,
  Search,
  ShieldCheck,
  Timer,
  WalletCards,
} from "lucide-react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import {
  STATUS_LABELS,
  formatCourseDateRange,
  formatCurrency,
  formatDate,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const REPORT_ROLES = new Set(["manager", "business_office", "accounting", "admin"]);
const STATUS_OPTIONS = Object.entries(STATUS_LABELS);
const CURRENT_YEAR = new Date().getFullYear();
const DATE_BASIS_OPTIONS: Array<[string, string]> = [
  ["request", "Request submitted"],
  ["course", "Course date"],
  ["approval", "Approval decision"],
  ["reimbursement", "Paycheck date"],
];
const TREND_CONFIG = {
  requested: { label: "Requested", color: "#64748b" },
  approved: { label: "Approved", color: "#007f86" },
  reimbursed: { label: "Paid", color: "#002855" },
} satisfies ChartConfig;

type ReportSection = "overview" | "funding" | "workflow" | "payroll" | "clinics";

const ROLE_CONTENT = {
  manager: {
    eyebrow: "Clinic reporting",
    description: "Track your clinic's employee balances, approvals, and missing receipts.",
    defaultSection: "funding" as ReportSection,
  },
  business_office: {
    eyebrow: "Funding oversight",
    description: "Monitor commitments, advanced funding, guarantees, and approval flow.",
    defaultSection: "funding" as ReportSection,
  },
  accounting: {
    eyebrow: "Reimbursement reporting",
    description: "Reconcile ready-to-pay receipts and completed paycheck batches.",
    defaultSection: "payroll" as ReportSection,
  },
  admin: {
    eyebrow: "Organization reporting",
    description: "Review funding, workflow health, payroll activity, and clinic patterns.",
    defaultSection: "overview" as ReportSection,
  },
} as const;

function numericParam(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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
    view: (searchParams.get("view") || "all") as GetReportParams["view"],
    dateBasis: (searchParams.get("dateBasis") || "request") as GetReportParams["dateBasis"],
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
    search: deferredSearch || undefined,
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
  if (!canView || !user) {
    return (
      <Card className="mx-auto max-w-xl border-slate-200">
        <CardHeader><CardTitle>Reports are not available for this account</CardTitle></CardHeader>
        <CardContent><Button asChild><Link href="/dashboard">Return to overview</Link></Button></CardContent>
      </Card>
    );
  }

  const roleContent = ROLE_CONTENT[user.role as keyof typeof ROLE_CONTENT];
  const sections = getSections(user.role);
  const requestedSection = searchParams.get("section") as ReportSection | null;
  const section = sections.some((item) => item.id === requestedSection)
    ? requestedSection!
    : roleContent.defaultSection;
  const activeFilterCount = [
    reportParams.clinicId,
    reportParams.employeeId,
    reportParams.status,
    reportParams.search,
    reportParams.dateFrom,
    reportParams.dateTo,
    reportParams.dateBasis !== "request" ? reportParams.dateBasis : undefined,
  ].filter(Boolean).length;
  const employees = (options?.employees ?? []).filter((employee) =>
    !reportParams.clinicId || employee.clinicId === reportParams.clinicId,
  );

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            <BarChart3 className="h-4 w-4" aria-hidden="true" /> {roleContent.eyebrow}
          </div>
          <h1 className="mt-1 font-serif text-3xl font-bold text-slate-950">CE operations reports</h1>
          <p className="mt-1 max-w-2xl text-slate-500">{roleContent.description}</p>
        </div>
        <Button onClick={exportCsv} disabled={exporting || reportQuery.isLoading}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {exporting ? "Exporting…" : "Export current view"}
        </Button>
      </header>

      <section className="rounded-md border border-slate-200 bg-slate-50/70 p-4" aria-labelledby="report-filters-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 id="report-filters-heading" className="font-semibold text-slate-900">Report scope</h2>
            <p className="text-sm text-slate-500">Choose whose activity to include and which event date defines the period.</p>
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <FilterX className="h-4 w-4" aria-hidden="true" /> Clear {activeFilterCount}
            </Button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label="Reporting year"
            value={String(year)}
            onChange={(value) => value && updateFilters({ year: value })}
            options={(options?.years?.length ? options.years : [CURRENT_YEAR]).map((value) => [String(value), String(value)])}
          />
          <FilterSelect
            label="Measure dates by"
            value={reportParams.dateBasis ?? "request"}
            onChange={(value) => value && updateFilters({ dateBasis: value })}
            options={DATE_BASIS_OPTIONS}
          />
          {user.role !== "manager" ? (
            <FilterSelect
              label="Clinic"
              value={reportParams.clinicId ? String(reportParams.clinicId) : "all"}
              onChange={(value) => value && updateFilters({ clinicId: value, employeeId: null })}
              options={[["all", "All clinics"], ...(options?.clinics ?? []).map((clinic) => [String(clinic.id), clinic.name] as [string, string])]}
            />
          ) : (
            <ReadOnlyScope label="Clinic" value={user.clinicName || "No clinic assigned"} />
          )}
          <EmployeePicker
            employees={employees}
            value={reportParams.employeeId ?? undefined}
            onChange={(value) => updateFilters({ employeeId: value })}
          />
          <FilterSelect
            label="Status"
            value={reportParams.status ?? "all"}
            onChange={(value) => value && updateFilters({ status: value })}
            options={[["all", "All statuses"], ...STATUS_OPTIONS]}
          />
          <DateFilter label="From" name="report-date-from" value={reportParams.dateFrom} onChange={(value) => updateFilters({ dateFrom: value })} />
          <DateFilter label="Through" name="report-date-to" value={reportParams.dateTo} onChange={(value) => updateFilters({ dateTo: value })} />
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            <span>Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                name="report-search"
                autoComplete="off"
                value={searchValue}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder="Search course, provider, or employee…"
                className="bg-white pl-9"
              />
            </div>
          </label>
        </div>
      </section>

      {reportQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Report could not be loaded</AlertTitle>
          <AlertDescription>{reportQuery.error instanceof Error ? reportQuery.error.message : "Refresh and try again."}</AlertDescription>
        </Alert>
      ) : reportQuery.isLoading || !report ? (
        <ReportBodySkeleton />
      ) : (
        <>
          <QuickViews
            views={report.quickViews}
            selected={reportParams.view ?? "all"}
            onSelect={(view) => updateFilters({ view, page: 1 })}
          />

          <Tabs value={section} onValueChange={(value) => updateFilters({ section: value })}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md border border-slate-200 bg-white p-1">
              {sections.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="min-w-fit gap-2 px-4 py-2">
                  <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-5 space-y-5">
              <FinancialSummary report={report} />
              <ExceptionStrip exceptions={report.exceptions} onSelect={(view) => updateFilters({ view, page: 1 })} />
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
                <TrendChart data={report.monthlyTrend} year={year} />
                <TurnaroundPanel data={report.turnaround} />
              </div>
            </TabsContent>

            <TabsContent value="funding" className="mt-5 space-y-5">
              <FundingSummary report={report} />
              <BudgetUsageTable rows={report.budgetUsage} />
              <AdvancedFundingTable rows={report.advancedRequests} />
            </TabsContent>

            <TabsContent value="workflow" className="mt-5 space-y-5">
              <ExceptionStrip exceptions={report.exceptions} onSelect={(view) => updateFilters({ view, page: 1 })} expanded />
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
                <WorkflowHealth stages={report.workflow} onSelect={(status) => updateFilters({ status, view: null, page: 1 })} />
                <TurnaroundPanel data={report.turnaround} />
              </div>
            </TabsContent>

            <TabsContent value="payroll" className="mt-5 space-y-5">
              <PaycheckLedger rows={report.paycheckLedger} />
            </TabsContent>

            <TabsContent value="clinics" className="mt-5 space-y-5">
              <ClinicComparison rows={report.clinicComparison} />
            </TabsContent>
          </Tabs>

          <RequestLedger
            rows={report.items}
            total={report.total}
            page={report.page}
            totalPages={report.totalPages}
            pageSize={pageSize}
            sort={reportParams.sort ?? "createdAt"}
            order={reportParams.order ?? "desc"}
            viewLabel={report.quickViews.find((item) => item.id === (reportParams.view ?? "all"))?.label}
            onUpdate={updateFilters}
          />
        </>
      )}
    </div>
  );
}

function getSections(role: string) {
  const all = [
    { id: "overview" as const, label: "Overview", icon: BarChart3 },
    { id: "funding" as const, label: role === "manager" ? "Team funding" : "Funding & advances", icon: WalletCards },
    { id: "workflow" as const, label: "Workflow", icon: Timer },
    { id: "payroll" as const, label: "Payroll", icon: BadgeDollarSign },
    { id: "clinics" as const, label: "Clinics", icon: Landmark },
  ];
  if (role === "manager") return all.filter((item) => !["payroll", "clinics"].includes(item.id));
  if (role === "business_office") return all.filter((item) => item.id !== "clinics");
  if (role === "accounting") return all.filter((item) => !["funding", "clinics"].includes(item.id));
  return all;
}

function QuickViews({
  views,
  selected,
  onSelect,
}: {
  views: Array<{ id: string; label: string; description: string; count: number }>;
  selected: string;
  onSelect: (view: string) => void;
}) {
  return (
    <section aria-labelledby="quick-views-heading">
      <div className="mb-2 flex items-center gap-2">
        <ListFilter className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <h2 id="quick-views-heading" className="text-sm font-semibold text-slate-700">Quick views</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {views.map((view) => (
          <Button
            key={view.id}
            variant={selected === view.id ? "default" : "outline"}
            className="h-auto min-h-10 gap-2 py-2"
            aria-pressed={selected === view.id}
            title={view.description}
            onClick={() => onSelect(view.id)}
          >
            {view.label}
            <Badge variant={selected === view.id ? "secondary" : "outline"} className="min-w-6 justify-center">
              {view.count}
            </Badge>
          </Button>
        ))}
      </div>
    </section>
  );
}

function FinancialSummary({ report }: { report: ReportResponse }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-label="Financial summary">
      <div className="grid sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Available benefit" value={formatCurrency(report.summary.totalAvailableAllocation)} detail="After carry-forward debt" />
        <Metric label="Requested" value={formatCurrency(report.summary.totalRequested)} detail={`${report.summary.totalRequests} requests in this view`} />
        <Metric label="Pending decisions" value={formatCurrency(report.summary.totalPending)} detail="Requested, not yet approved" />
        <Metric label="Approved funding" value={formatCurrency(report.summary.totalApproved)} detail="Final approvals in this view" />
        <Metric label="Paid" value={formatCurrency(report.summary.totalReimbursed)} detail="Actual reimbursements recorded" />
      </div>
      <div className="grid gap-px border-t border-slate-200 bg-slate-200 text-xs sm:grid-cols-3">
        <Definition label="Requested" text="The amount employees originally submitted." />
        <Definition label="Approved" text="Final funding authorized by the Business Office." />
        <Definition label="Paid" text="The actual amount recorded on a paycheck." />
      </div>
    </section>
  );
}

function FundingSummary({ report }: { report: ReportResponse }) {
  return (
    <section className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4" aria-label="Funding summary">
      <Metric label="Available benefit" value={formatCurrency(report.summary.totalAvailableAllocation)} detail={`${report.budgetUsage.length} employees in scope`} />
      <Metric label="Carry-forward debt" value={formatCurrency(report.summary.totalCarryoverDebt)} detail="Prior advances applied this year" emphasis={report.summary.totalCarryoverDebt > 0} />
      <Metric label="Potential advance" value={formatCurrency(report.summary.advancedExposure)} detail="Approved and pending above available benefit" emphasis={report.summary.advancedExposure > 0} />
      <Metric label="Approved, unpaid" value={formatCurrency(report.summary.outstandingApproved)} detail="Waiting for receipt or reimbursement" />
    </section>
  );
}

function ExceptionStrip({
  exceptions,
  onSelect,
  expanded = false,
}: {
  exceptions: Array<{ id: string; label: string; description: string; count: number; severity: string; view: string }>;
  onSelect: (view: string) => void;
  expanded?: boolean;
}) {
  if (exceptions.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3" aria-label="Exceptions">
        <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <div><div className="font-semibold text-emerald-950">No exceptions in this view</div><div className="text-sm text-emerald-800">There are no aging or incomplete records requiring follow-up.</div></div>
      </section>
    );
  }
  return (
    <section aria-labelledby="exceptions-heading">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 id="exceptions-heading" className="font-serif text-lg font-bold text-slate-950">Needs attention</h2>
          {expanded ? <p className="text-sm text-slate-500">Operational exceptions, not formal deadlines.</p> : null}
        </div>
        <Badge variant="outline">{exceptions.reduce((sum, item) => sum + item.count, 0)} flags</Badge>
      </div>
      <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-3">
        {exceptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.view)}
            className="group flex min-h-24 items-start gap-3 border-b border-slate-200 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:border-r"
          >
            <AlertCircle className={cn("mt-0.5 h-5 w-5 shrink-0", item.severity === "follow_up" ? "text-red-700" : "text-amber-700")} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3 font-semibold text-slate-900">
                {item.label}<span className="tabular-nums">{item.count}</span>
              </span>
              <span className="mt-1 block text-sm leading-5 text-slate-500">{item.description}</span>
            </span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function TrendChart({ data, year }: { data: Array<{ month: number; label: string; requested: number; approved: number; reimbursed: number }>; year: number }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5" aria-labelledby="trend-heading">
      <div>
        <h2 id="trend-heading" className="font-serif text-lg font-bold text-slate-950">{year} funding activity</h2>
        <p className="mt-0.5 text-sm text-slate-500">Each line uses its own event date: submission, final approval, or paycheck.</p>
      </div>
      <ChartContainer config={TREND_CONFIG} className="mt-5 h-72 w-full aspect-auto">
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
          <YAxis tickFormatter={(value) => compactCurrency(Number(value))} tickLine={false} axisLine={false} width={62} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-5">
              <span className="text-muted-foreground">{TREND_CONFIG[name as keyof typeof TREND_CONFIG]?.label}</span>
              <span className="font-mono font-medium tabular-nums">{formatCurrency(Number(value))}</span>
            </div>
          )} />} />
          <Line type="monotone" dataKey="requested" stroke="var(--color-requested)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="approved" stroke="var(--color-approved)" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="reimbursed" stroke="var(--color-reimbursed)" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {Object.entries(TREND_CONFIG).map(([key, item]) => (
          <span key={key} className="flex items-center gap-2"><span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />{item.label}</span>
        ))}
      </div>
    </section>
  );
}

function TurnaroundPanel({ data }: { data: Array<{ stage: string; label: string; medianDays: number | null; p90Days: number | null; sampleSize: number }> }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5" aria-labelledby="turnaround-heading">
      <h2 id="turnaround-heading" className="font-serif text-lg font-bold text-slate-950">Turnaround</h2>
      <p className="mt-0.5 text-sm text-slate-500">Median shows the typical result; 90th percentile highlights the slower edge.</p>
      <div className="mt-5 divide-y divide-slate-200">
        {data.map((item) => (
          <div key={item.stage} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-4 first:pt-0 last:pb-0">
            <div>
              <div className="font-medium text-slate-900">{item.label}</div>
              <div className="text-xs text-slate-500">{item.sampleSize} completed records</div>
            </div>
            <div className="text-right"><div className="font-semibold tabular-nums">{item.medianDays == null ? "--" : `${item.medianDays}d`}</div><div className="text-xs text-slate-500">median</div></div>
            <div className="text-right"><div className="font-semibold tabular-nums text-slate-600">{item.p90Days == null ? "--" : `${item.p90Days}d`}</div><div className="text-xs text-slate-500">90th</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkflowHealth({ stages, onSelect }: { stages: Array<{ status: string; label: string; count: number; oldestDays?: number | null }>; onSelect: (status: string) => void }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="workflow-health-heading">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div><h2 id="workflow-health-heading" className="font-serif text-lg font-bold text-slate-950">Current queues</h2><p className="text-sm text-slate-500">Select a queue to inspect its requests.</p></div>
        <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="grid sm:grid-cols-2">
        {stages.map((stage) => (
          <button key={stage.status} type="button" onClick={() => onSelect(stage.status)} className="group border-b border-slate-200 p-5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:border-r">
            <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-700">{stage.label}</span><Badge variant={stage.count ? "secondary" : "outline"}>{stage.count}</Badge></div>
            <div className="mt-3 flex items-end justify-between gap-3"><div><div className="text-2xl font-bold tabular-nums text-slate-950">{stage.oldestDays == null ? "Clear" : `${stage.oldestDays}d`}</div><div className="text-xs text-slate-500">{stage.oldestDays == null ? "No items waiting" : "Oldest item waiting"}</div></div><ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" /></div>
          </button>
        ))}
      </div>
    </section>
  );
}

function BudgetUsageTable({ rows }: { rows: ReportBudgetRow[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="budget-usage-heading">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 id="budget-usage-heading" className="font-serif text-lg font-bold text-slate-950">Employee budget usage</h2>
        <p className="text-sm text-slate-500">Annual benefit, prior debt, current commitments, and remaining funding.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>Employee</TableHead><TableHead>Usage</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Used</TableHead><TableHead className="text-right">Pending</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead className="text-right">Future debt</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="h-28 text-center text-slate-500">No employees match this scope.</TableCell></TableRow> : rows.map((row) => {
              const consumed = row.usedAmount + row.pendingAmount;
              const percentage = row.availableAllocation > 0 ? Math.min(100, (consumed / row.availableAllocation) * 100) : consumed > 0 ? 100 : 0;
              return (
                <TableRow key={row.employeeId}>
                  <TableCell><Link href={`/users/${row.employeeId}`} className="font-medium text-slate-900 hover:text-primary hover:underline">{row.employeeName}</Link><div className="text-xs text-slate-500">{row.clinicName || "No clinic"}</div></TableCell>
                  <TableCell className="min-w-40"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full", row.advancedExposure > 0 ? "bg-amber-600" : "bg-primary")} style={{ width: `${percentage}%` }} /></div><div className="mt-1 text-xs text-slate-500">{Math.round(percentage)}% committed</div></TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.availableAllocation)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.usedAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.pendingAmount)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(row.remainingAmount)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", (row.carryoverDebt > 0 || row.advancedExposure > 0) && "font-semibold text-amber-800")}>{formatCurrency(row.carryoverDebt + row.advancedExposure)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function AdvancedFundingTable({ rows }: { rows: ReportAdvancedRequest[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="advanced-funding-heading">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div><h2 id="advanced-funding-heading" className="font-serif text-lg font-bold text-slate-950">Advanced funding and repayment guarantees</h2><p className="text-sm text-slate-500">Requests above the employee&apos;s available CE benefit for the reporting year.</p></div>
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>Employee</TableHead><TableHead>Request</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Requested</TableHead><TableHead>Guarantee</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={5} className="h-28 text-center text-slate-500">No advanced-funding requests in this reporting year.</TableCell></TableRow> : rows.map((row) => (
              <TableRow key={row.requestId}>
                <TableCell><div className="font-medium text-slate-900">{row.employeeName}</div><div className="text-xs text-slate-500">{row.clinicName || "No clinic"}</div></TableCell>
                <TableCell><Link href={`/requests/${row.requestId}`} className="font-medium text-primary hover:underline">Request #{row.requestId}</Link></TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.requestedAmount)}</TableCell>
                <TableCell>{row.guaranteeSigned ? <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><Check className="h-4 w-4" />Signed {row.guaranteeSignedAt ? formatDate(row.guaranteeSignedAt) : ""}</span> : <span className="inline-flex items-center gap-1.5 font-medium text-red-700"><AlertCircle className="h-4 w-4" />Missing</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PaycheckLedger({ rows }: { rows: ReportPaycheckBatch[] }) {
  const total = rows.reduce((sum, row) => sum + row.totalAmount, 0);
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="paycheck-ledger-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div><h2 id="paycheck-ledger-heading" className="font-serif text-lg font-bold text-slate-950">Paycheck reimbursement ledger</h2><p className="text-sm text-slate-500">Completed reimbursements grouped by paycheck date for reconciliation.</p></div>
        <div className="text-right"><div className="text-xs font-semibold uppercase text-slate-500">Total paid</div><div className="text-2xl font-bold tabular-nums text-slate-950">{formatCurrency(total)}</div></div>
      </div>
      <Table>
        <TableHeader><TableRow className="bg-slate-50"><TableHead>Paycheck date</TableHead><TableHead className="text-right">Employees reimbursed</TableHead><TableHead className="text-right">Batch total</TableHead><TableHead className="w-32" /></TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="h-28 text-center text-slate-500">No reimbursements were recorded in this reporting year.</TableCell></TableRow> : rows.map((row) => (
            <TableRow key={row.paycheckDate}>
              <TableCell className="font-medium">{formatDate(row.paycheckDate)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.reimbursementCount}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(row.totalAmount)}</TableCell>
              <TableCell><Button asChild variant="ghost" size="sm"><Link href={`/requests?status=reimbursed`}>View payments</Link></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function ClinicComparison({ rows }: { rows: ReportClinicComparison[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="clinic-comparison-heading">
      <div className="border-b border-slate-200 px-5 py-4"><h2 id="clinic-comparison-heading" className="font-serif text-lg font-bold text-slate-950">Clinic comparison</h2><p className="text-sm text-slate-500">Request volume and funding outcomes. Read denial percentages alongside volume, especially for small clinics.</p></div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>Clinic</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Requested</TableHead><TableHead className="text-right">Approved</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Denied</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-500">No clinic activity matches this reporting year.</TableCell></TableRow> : rows.map((row) => (
              <TableRow key={row.clinicId ?? "unassigned"}>
                <TableCell className="font-medium text-slate-900">{row.clinicName}</TableCell>
                <TableCell className="text-right tabular-nums">{row.requestCount}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.requested)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.approved)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.reimbursed)}</TableCell>
                <TableCell className="text-right"><span className="font-medium tabular-nums">{row.denialRate}%</span><div className="text-xs text-slate-500">{row.denialCount} requests</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function RequestLedger({
  rows,
  total,
  page,
  totalPages,
  pageSize,
  sort,
  order,
  viewLabel,
  onUpdate,
}: {
  rows: ReportRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  sort: string;
  order: string;
  viewLabel?: string;
  onUpdate: (updates: Record<string, string | number | null | undefined>) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="request-ledger-heading">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div><h2 id="request-ledger-heading" className="font-serif text-lg font-bold text-slate-950">Request ledger</h2><p className="text-sm text-slate-500">{total} matching requests{viewLabel ? ` in ${viewLabel.toLowerCase()}` : ""}</p></div>
        <div className="flex items-center gap-2">
          <FilterSelect label="Sort requests" hideLabel value={sort} onChange={(value) => value && onUpdate({ sort: value })} options={[["createdAt", "Request date"], ["courseStartDate", "Course date"], ["employeeName", "Employee"], ["totalRequested", "Requested amount"], ["totalApproved", "Approved amount"], ["status", "Status"]]} />
          <Button variant="outline" size="icon" aria-label={order === "asc" ? "Sort descending" : "Sort ascending"} onClick={() => onUpdate({ order: order === "asc" ? "desc" : "asc" })}>{order === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>Course</TableHead><TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Requested</TableHead><TableHead className="text-right">Approved</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="h-36 text-center text-slate-500">No requests match this report scope.</TableCell></TableRow> : rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-72"><Link href={`/requests/${row.id}`} className="font-medium text-slate-950 hover:text-primary hover:underline">{row.courseName}</Link><div className="mt-0.5 truncate text-xs text-slate-500">{formatCourseDateRange(row.courseStartDate, row.courseEndDate, row.legacyCourseDates)}{row.courseProvider ? ` | ${row.courseProvider}` : ""}</div></TableCell>
                <TableCell><div className="font-medium text-slate-800">{row.employeeName}</div><div className="text-xs text-slate-500">{row.clinicName || "No clinic"}</div></TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.totalRequested)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.totalApproved == null ? "--" : formatCurrency(row.totalApproved)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.reimbursementAmount == null ? "--" : formatCurrency(row.reimbursementAmount)}</TableCell>
                <TableCell className="whitespace-nowrap text-slate-500">{formatDate(row.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500"><WalletCards className="h-4 w-4" aria-hidden="true" /> Page {page} of {totalPages}</div>
        <div className="flex items-center gap-2">
          <FilterSelect label="Rows per page" hideLabel value={String(pageSize)} onChange={(value) => value && onUpdate({ pageSize: value, page: 1 })} options={[["25", "25 rows"], ["50", "50 rows"], ["100", "100 rows"]]} />
          <Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onUpdate({ page: page - 1 })}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Next page" disabled={page >= totalPages} onClick={() => onUpdate({ page: page + 1 })}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </section>
  );
}

function EmployeePicker({
  employees,
  value,
  onChange,
}: {
  employees: Array<{ id: number; name: string; clinicName?: string | null }>;
  value?: number;
  onChange: (value: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((employee) => employee.id === value);
  return (
    <label className="space-y-1.5 text-sm font-medium text-slate-700">
      <span>Employee</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} aria-label="Employee" className="w-full justify-between bg-white font-normal">
            <span className="truncate">{selected ? selected.name : "All employees"}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search employees…" />
            <CommandList>
              <CommandEmpty>No employee found.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="All employees" onSelect={() => { onChange(null); setOpen(false); }}>
                  <Check className={cn("h-4 w-4", !value ? "opacity-100" : "opacity-0")} /> All employees
                </CommandItem>
                {employees.map((employee) => (
                  <CommandItem key={employee.id} value={`${employee.name} ${employee.clinicName ?? ""}`} onSelect={() => { onChange(employee.id); setOpen(false); }}>
                    <Check className={cn("h-4 w-4", value === employee.id ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0"><span className="block truncate">{employee.name}</span>{employee.clinicName ? <span className="block text-xs text-slate-500">{employee.clinicName}</span> : null}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </label>
  );
}

function FilterSelect({ label, value, onChange, options, hideLabel = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; hideLabel?: boolean }) {
  return (
    <label className={hideLabel ? "" : "space-y-1.5 text-sm font-medium text-slate-700"}>
      {!hideLabel ? <span>{label}</span> : null}
      <Select value={value} onValueChange={(next) => { if (next) onChange(next); }}>
        <SelectTrigger aria-label={label} className="bg-white"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

function DateFilter({ label, name, value, onChange }: { label: string; name: string; value?: string; onChange: (value: string) => void }) {
  return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span><Input type="date" name={name} autoComplete="off" className="bg-white" value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ReadOnlyScope({ label, value }: { label: string; value: string }) {
  return <div className="space-y-1.5 text-sm font-medium text-slate-700"><div>{label}</div><div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-100 px-3 font-normal text-slate-700">{value}</div></div>;
}

function Metric({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return <div className="border-b border-slate-200 p-5 last:border-b-0 sm:border-r xl:border-b-0"><div className="text-xs font-semibold uppercase text-slate-500">{label}</div><div className={cn("mt-2 text-2xl font-bold tabular-nums", emphasis ? "text-amber-800" : "text-slate-950")}>{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
}

function Definition({ label, text }: { label: string; text: string }) {
  return <div className="bg-slate-50 px-4 py-3 text-slate-600"><span className="font-semibold text-slate-800">{label}:</span> {text}</div>;
}

function ReportsSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-56 w-full" /><ReportBodySkeleton /></div>;
}

function ReportBodySkeleton() {
  return <div className="space-y-6"><Skeleton className="h-14 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-80 w-full" /><Skeleton className="h-96 w-full" /></div>;
}
