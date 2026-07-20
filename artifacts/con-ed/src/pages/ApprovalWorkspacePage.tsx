import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "wouter";
import {
  type BalanceInfo,
  type ConEdRequest,
  type ListRequestsParams,
  customFetch,
  getGetRequestQueryKey,
  getGetUserBalanceQueryKey,
  getListClinicsQueryKey,
  getListRequestsQueryKey,
  useGetMe,
  useGetRequest,
  useGetUserBalance,
  useListClinics,
  useListRequests,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RequestTimeline } from "@/components/RequestTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/constants";

type ReviewRole = "manager" | "business_office";
type CostKey =
  | "approvedTuition"
  | "approvedLodging"
  | "approvedAirfare"
  | "approvedRentalCar"
  | "approvedParking"
  | "approvedOther";

type ApprovalAmounts = Record<CostKey, number>;

const COST_FIELDS: Array<{
  key: CostKey;
  requestedKey: keyof ConEdRequest;
  label: string;
}> = [
  { key: "approvedTuition", requestedKey: "tuition", label: "Tuition / registration" },
  { key: "approvedLodging", requestedKey: "lodging", label: "Lodging" },
  { key: "approvedAirfare", requestedKey: "airfare", label: "Airfare" },
  { key: "approvedRentalCar", requestedKey: "rentalCar", label: "Rental car" },
  { key: "approvedParking", requestedKey: "parking", label: "Parking / tolls" },
  { key: "approvedOther", requestedKey: "otherCosts", label: "Other costs" },
];

function requestedAmounts(request: ConEdRequest): ApprovalAmounts {
  return {
    approvedTuition: request.tuition ?? 0,
    approvedLodging: request.lodging ?? 0,
    approvedAirfare: request.airfare ?? 0,
    approvedRentalCar: request.rentalCar ?? 0,
    approvedParking: request.parking ?? 0,
    approvedOther: request.otherCosts ?? 0,
  };
}

function approvalTotal(amounts: ApprovalAmounts) {
  return Object.values(amounts).reduce((total, amount) => total + (Number(amount) || 0), 0);
}

function requestAge(createdAt: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (elapsedMinutes < 1) return "less than a minute";
  if (elapsedMinutes < 60) return `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"}`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"}`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`;
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"}`;
  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `${elapsedYears} year${elapsedYears === 1 ? "" : "s"}`;
}

export default function ApprovalWorkspacePage() {
  const { data: user } = useGetMe();
  const role = user?.role as ReviewRole | "employee" | "accounting" | "admin" | undefined;
  const reviewRole: ReviewRole | null = role === "manager" || role === "business_office" ? role : null;
  const queueStatus = reviewRole === "manager" ? "pending_manager" : "pending_bo";
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const [denyReason, setDenyReason] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [approvalAmounts, setApprovalAmounts] = useState<ApprovalAmounts>({
    approvedTuition: 0,
    approvedLodging: 0,
    approvedAirfare: 0,
    approvedRentalCar: 0,
    approvedParking: 0,
    approvedOther: 0,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clinicId = searchParams.get("clinicId");
  const selectedId = Number(searchParams.get("selected")) || 0;
  const queryParams: ListRequestsParams = {
    status: queueStatus,
    page: 1,
    pageSize: 100,
    sort: "createdAt",
    order: "asc",
    ...(reviewRole === "manager" ? { scope: "approvals" } : {}),
    ...(searchParams.get("search") ? { search: searchParams.get("search")! } : {}),
    ...(clinicId ? { clinicId: Number(clinicId) } : {}),
  };

  const queueQuery = useListRequests(queryParams, {
    query: { enabled: Boolean(reviewRole), queryKey: getListRequestsQueryKey(queryParams) },
  });
  const clinicsQuery = useListClinics({
    query: { enabled: reviewRole === "business_office", queryKey: getListClinicsQueryKey() },
  });
  const requests = queueQuery.data?.items ?? [];

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setSearchValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (reviewRole && !queueQuery.isLoading && requests.length > 0 && !selectedId) {
      setParams({ selected: String(requests[0].id) });
    }
  }, [reviewRole, queueQuery.isLoading, requests, selectedId]);

  useEffect(() => {
    if (reviewRole && !queueQuery.isLoading && selectedId && !requests.some((item) => item.id === selectedId)) {
      setParams({ selected: requests[0] ? String(requests[0].id) : null });
    }
  }, [reviewRole, queueQuery.isLoading, requests, selectedId]);

  const requestQuery = useGetRequest(selectedId, {
    query: { enabled: Boolean(reviewRole && selectedId), queryKey: getGetRequestQueryKey(selectedId) },
  });
  const request = requestQuery.data;
  const balanceQuery = useGetUserBalance(request?.employeeId ?? 0, {
    query: {
      enabled: Boolean(request?.employeeId),
      queryKey: getGetUserBalanceQueryKey(request?.employeeId ?? 0),
    },
  });

  useEffect(() => {
    if (request) setApprovalAmounts(requestedAmounts(request));
  }, [request?.id]);

  const totalApproved = approvalTotal(approvalAmounts);
  const adjustedFields = useMemo(() => {
    if (!request) return [];
    return COST_FIELDS.filter(({ key, requestedKey }) => {
      const requested = Number(request[requestedKey] ?? 0);
      return Math.abs(approvalAmounts[key] - requested) >= 0.005;
    });
  }, [approvalAmounts, request]);

  const managerApprove = useMutation({
    mutationFn: (requestId: number) =>
      customFetch(`/api/requests/${requestId}/manager-approve`, { method: "POST" }),
  });
  const managerDeny = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      customFetch(`/api/requests/${requestId}/manager-deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
  });
  const boApprove = useMutation({
    mutationFn: ({ requestId, amounts }: { requestId: number; amounts: ApprovalAmounts }) =>
      customFetch(`/api/requests/${requestId}/bo-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...amounts, totalApproved: approvalTotal(amounts) }),
      }),
  });
  const boDeny = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      customFetch(`/api/requests/${requestId}/bo-deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
  });

  const openNextAfter = async (completedId: number, message: string) => {
    const nextRequest = requests.find((item) => item.id !== completedId);
    await queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    toast({ title: message, description: nextRequest ? "The next request is ready for review." : "The approval queue is clear." });
    setParams({ selected: nextRequest ? String(nextRequest.id) : null });
  };

  const showActionError = (error: unknown) => {
    toast({
      title: "Decision was not saved",
      description: error instanceof Error ? error.message : "Try again.",
      variant: "destructive",
    });
  };

  const approveCurrent = () => {
    if (!request || !reviewRole) return;
    if (reviewRole === "manager") {
      managerApprove.mutate(request.id, {
        onSuccess: () => openNextAfter(request.id, "Manager approval saved"),
        onError: showActionError,
      });
      return;
    }
    boApprove.mutate(
      { requestId: request.id, amounts: approvalAmounts },
      {
        onSuccess: () => openNextAfter(request.id, "Business Office approval saved"),
        onError: showActionError,
      },
    );
  };

  const denyCurrent = () => {
    if (!request || !reviewRole || !denyReason.trim()) return;
    const mutation = reviewRole === "manager" ? managerDeny : boDeny;
    mutation.mutate(
      { requestId: request.id, reason: denyReason.trim() },
      {
        onSuccess: () => {
          setDenyOpen(false);
          setDenyReason("");
          openNextAfter(request.id, "Denial saved");
        },
        onError: showActionError,
      },
    );
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setParams({ search: searchValue.trim() || null, selected: null });
  };

  if (user && !reviewRole) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <FileCheck2 aria-hidden="true" className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-2xl font-serif font-bold text-slate-950">Approval workspace unavailable</h1>
        <p className="mt-2 text-slate-500">This workspace is for clinic managers and the Business Office.</p>
      </div>
    );
  }

  const oldestRequest = requests[0];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Continuing Education</p>
          <h1 className="mt-1 text-3xl font-serif font-bold text-slate-950">
            {reviewRole === "manager" ? "Manager Approvals" : "CE Approvals"}
          </h1>
          <p className="mt-1 text-slate-500">Review each request with its course, funding, and policy context in one place.</p>
        </div>
        <div className="flex items-center gap-5 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Waiting</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-950">{queueQuery.data?.total ?? 0}</div>
          </div>
          <div className="h-9 w-px bg-slate-200" />
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Oldest</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Clock3 aria-hidden="true" className="h-4 w-4 text-amber-600" />
              {oldestRequest ? requestAge(oldestRequest.createdAt) : "Queue clear"}
            </div>
          </div>
        </div>
      </header>

      <section className="grid min-h-[680px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-13rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <form onSubmit={submitSearch} className="flex">
              <Input
                aria-label="Search approval queue"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search requests"
                className="rounded-r-none bg-white"
              />
              <Button type="submit" variant="outline" size="icon" className="-ml-px shrink-0 rounded-l-none" aria-label="Search">
                <Search aria-hidden="true" />
              </Button>
            </form>
            {reviewRole === "business_office" && (
              <Select value={clinicId ?? "all"} onValueChange={(value) => setParams({ clinicId: value === "all" ? null : value, selected: null })}>
                <SelectTrigger aria-label="Filter by clinic" className="bg-white">
                  <SelectValue placeholder="All clinics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clinics</SelectItem>
                  {(clinicsQuery.data ?? []).map((clinic) => (
                    <SelectItem key={clinic.id} value={String(clinic.id)}>{clinic.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2" role="list" aria-label="Requests awaiting approval">
              {queueQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="mb-2 h-24 w-full" />)
              ) : queueQuery.isError ? (
                <div className="p-5 text-center">
                  <p className="text-sm font-medium text-slate-900">Queue could not be loaded</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => queueQuery.refetch()}>
                    <RefreshCw aria-hidden="true" /> Try again
                  </Button>
                </div>
              ) : requests.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <ShieldCheck aria-hidden="true" className="mx-auto h-9 w-9 text-emerald-600" />
                  <p className="mt-3 font-medium text-slate-900">Queue is clear</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {searchParams.get("search") || clinicId ? "No requests match these filters." : "There are no requests waiting for approval."}
                  </p>
                  {(searchParams.get("search") || clinicId) && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setParams({ search: null, clinicId: null, selected: null })}>
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                requests.map((item) => {
                  const selected = item.id === selectedId;
                  return (
                    <div role="listitem" key={item.id}>
                      <button
                        type="button"
                        onClick={() => setParams({ selected: String(item.id) })}
                        className={`mb-1.5 w-full rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-white shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-white"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-950">{item.courseNames}</div>
                            <div className="mt-1 truncate text-xs text-slate-500">{item.employeeName} - {item.clinicName || "No clinic"}</div>
                          </div>
                          <ChevronRight aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-slate-300"}`} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(item.totalRequested)}</span>
                          <span className="text-xs text-slate-500">Waiting {requestAge(item.createdAt)}</span>
                        </div>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          {!selectedId || (!requestQuery.isLoading && !request) ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div>
                <FileCheck2 aria-hidden="true" className="mx-auto h-10 w-10 text-slate-300" />
                <h2 className="mt-4 text-xl font-serif font-bold text-slate-900">Select a request to review</h2>
                <p className="mt-1 text-sm text-slate-500">Course and funding details will appear here.</p>
              </div>
            </div>
          ) : requestQuery.isLoading || !request ? (
            <div className="space-y-5 p-6">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : (
            <ReviewPane
              request={request}
              currentUserId={user?.id}
              reviewRole={reviewRole!}
              balance={balanceQuery.data}
              balanceLoading={balanceQuery.isLoading}
              approvalAmounts={approvalAmounts}
              setApprovalAmounts={setApprovalAmounts}
              totalApproved={totalApproved}
              adjustedFields={adjustedFields}
              denyReason={denyReason}
              setDenyReason={setDenyReason}
              denyOpen={denyOpen}
              setDenyOpen={setDenyOpen}
              denyCurrent={denyCurrent}
              approveCurrent={approveCurrent}
              actionPending={managerApprove.isPending || managerDeny.isPending || boApprove.isPending || boDeny.isPending}
            />
          )}
        </main>
      </section>
    </div>
  );
}

function ReviewPane({
  request,
  currentUserId,
  reviewRole,
  balance,
  balanceLoading,
  approvalAmounts,
  setApprovalAmounts,
  totalApproved,
  adjustedFields,
  denyReason,
  setDenyReason,
  denyOpen,
  setDenyOpen,
  denyCurrent,
  approveCurrent,
  actionPending,
}: {
  request: ConEdRequest;
  currentUserId?: number;
  reviewRole: ReviewRole;
  balance?: BalanceInfo;
  balanceLoading: boolean;
  approvalAmounts: ApprovalAmounts;
  setApprovalAmounts: React.Dispatch<React.SetStateAction<ApprovalAmounts>>;
  totalApproved: number;
  adjustedFields: typeof COST_FIELDS;
  denyReason: string;
  setDenyReason: (reason: string) => void;
  denyOpen: boolean;
  setDenyOpen: (open: boolean) => void;
  denyCurrent: () => void;
  approveCurrent: () => void;
  actionPending: boolean;
}) {
  const isSelfApproval = reviewRole === "manager" && request.employeeId === currentUserId;
  const guaranteeMissing = Boolean(request.requiresRepaymentGuarantee && !request.repaymentGuarantee);
  const requestAdvance = Math.max(0, request.totalRequested - (balance?.remainingAmount ?? request.totalRequested));

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-slate-200">
          <section className="p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-500">Request #{request.id}</span>
                  <StatusBadge status={request.status} />
                  {isSelfApproval && (
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                      <UserRoundCheck aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Self-approval
                    </Badge>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-serif font-bold text-slate-950">{request.courseNames}</h2>
                <p className="mt-1 text-sm text-slate-500">Created {formatDateTime(request.createdAt)}</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium uppercase text-slate-500">Requested</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{formatCurrency(request.totalRequested)}</div>
              </div>
            </div>

            {isSelfApproval && (
              <Alert className="mt-5 border-blue-200 bg-blue-50 text-blue-950">
                <UserRoundCheck aria-hidden="true" className="h-4 w-4 text-blue-700" />
                <AlertTitle>Manager self-approval</AlertTitle>
                <AlertDescription>This request was submitted by you. Current OSS policy allows managers to approve their own CE requests.</AlertDescription>
              </Alert>
            )}
            {guaranteeMissing && (
              <Alert variant="destructive" className="mt-5">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                <AlertTitle>Repayment guarantee required</AlertTitle>
                <AlertDescription>The employee must sign the guarantee before manager approval can continue.</AlertDescription>
              </Alert>
            )}
          </section>

          <section className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <h3 className="text-sm font-semibold uppercase text-slate-500">Course and employee</h3>
              <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label="Employee" value={request.employeeName || "Unknown"} secondary={request.employeeEmail} />
                <Detail label="Clinic" value={request.clinicName || "No clinic assigned"} />
                <Detail label="Course dates" value={request.courseDates || "Not provided"} />
                <Detail label="Location" value={request.location || "Not provided"} />
                <Detail label="CEUs" value={request.ceuCount != null ? String(request.ceuCount) : "Not provided"} />
              </dl>
            </div>
            <FundingSummary request={request} balance={balance} loading={balanceLoading} />
          </section>

          <section className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-slate-950">Funding review</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {reviewRole === "business_office" ? "Compare the request and set final approved amounts." : "Review all requested costs before making a decision."}
                </p>
              </div>
              {reviewRole === "business_office" && (
                <Button type="button" variant="outline" size="sm" onClick={() => setApprovalAmounts(requestedAmounts(request))}>
                  Use requested amounts
                </Button>
              )}
            </div>

            <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Category</th>
                    <th className="px-4 py-3 text-right font-medium">Requested</th>
                    {reviewRole === "business_office" && <th className="w-48 px-4 py-3 text-right font-medium">Approved</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {COST_FIELDS.map(({ key, requestedKey, label }) => {
                    const requested = Number(request[requestedKey] ?? 0);
                    const adjusted = Math.abs(approvalAmounts[key] - requested) >= 0.005;
                    return (
                      <tr key={key} className={adjusted ? "bg-amber-50/70" : ""}>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {label}
                          {adjusted && <span className="ml-2 text-xs font-normal text-amber-700">Adjusted</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(requested)}</td>
                        {reviewRole === "business_office" && (
                          <td className="px-4 py-2">
                            <div className="relative ml-auto w-36">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                aria-label={`Approved ${label}`}
                                className="h-9 pl-7 text-right tabular-nums"
                                value={approvalAmounts[key]}
                                onChange={(event) => setApprovalAmounts((current) => ({
                                  ...current,
                                  [key]: Math.max(0, Number(event.target.value) || 0),
                                }))}
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-4 text-left text-base">Total</th>
                    <td className="px-4 py-4 text-right text-base font-bold tabular-nums">{formatCurrency(request.totalRequested)}</td>
                    {reviewRole === "business_office" && (
                      <td className="px-4 py-4 text-right text-lg font-bold tabular-nums text-primary">{formatCurrency(totalApproved)}</td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>

            {reviewRole === "business_office" && adjustedFields.length > 0 && (
              <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-950">
                <AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-700" />
                <AlertTitle>{adjustedFields.length} funding {adjustedFields.length === 1 ? "amount differs" : "amounts differ"}</AlertTitle>
                <AlertDescription>
                  {adjustedFields.map((field) => field.label).join(", ")} {adjustedFields.length === 1 ? "does" : "do"} not match the employee&apos;s request.
                </AlertDescription>
              </Alert>
            )}
            {request.requiresRepaymentGuarantee && (
              <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-950">
                <CircleDollarSign aria-hidden="true" className="h-4 w-4 text-amber-700" />
                <AlertTitle>Advanced CE funding</AlertTitle>
                <AlertDescription>
                  {request.repaymentGuarantee
                    ? `Repayment guarantee signed by ${request.repaymentGuarantee.signedName} on ${formatDate(request.repaymentGuarantee.signedAt)}.`
                    : `This request exceeds the current balance by ${formatCurrency(requestAdvance)} and still needs a signed repayment guarantee.`}
                </AlertDescription>
              </Alert>
            )}
          </section>

          <section className="p-6">
            <h3 className="text-lg font-serif font-bold text-slate-950">Audit timeline</h3>
            <p className="mt-1 text-sm text-slate-500">Recorded decisions, signatures, receipts, and reimbursement activity.</p>
            <div className="mt-5 max-w-2xl">
              <RequestTimeline request={request} />
            </div>
          </section>
        </div>
      </ScrollArea>

      <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]">
        <div className="text-sm text-slate-500">
          {guaranteeMissing ? "Approval is locked until the guarantee is signed." : "Your name and decision time will be recorded."}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={denyOpen} onOpenChange={(open) => {
            setDenyOpen(open);
            if (!open) setDenyReason("");
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">
                <X aria-hidden="true" /> Deny
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deny request #{request.id}?</DialogTitle>
                <DialogDescription>The employee will see this reason in the request timeline.</DialogDescription>
              </DialogHeader>
              <div>
                <label htmlFor="approval-denial-reason" className="mb-2 block text-sm font-medium text-slate-800">Reason for denial</label>
                <Textarea
                  id="approval-denial-reason"
                  value={denyReason}
                  onChange={(event) => setDenyReason(event.target.value)}
                  placeholder="Explain why this request cannot be approved..."
                  rows={4}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDenyOpen(false)}>Cancel</Button>
                <Button variant="destructive" disabled={!denyReason.trim() || actionPending} onClick={denyCurrent}>Confirm denial</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={guaranteeMissing || actionPending}>
                <Check aria-hidden="true" /> Approve and open next <ArrowRight aria-hidden="true" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Approve request #{request.id}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {reviewRole === "manager"
                    ? `${request.employeeName ?? "The employee"}'s ${formatCurrency(request.totalRequested)} request will move to the Business Office queue.`
                    : `${formatCurrency(totalApproved)} will be approved and the employee can then submit a receipt.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="font-medium text-slate-900">{request.courseNames}</div>
                <div className="mt-1 text-slate-500">{request.employeeName} - {request.clinicName || "No clinic"}</div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Go back</AlertDialogCancel>
                <AlertDialogAction onClick={approveCurrent} disabled={actionPending}>Confirm approval</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </footer>
    </>
  );
}

function Detail({ label, value, secondary }: { label: string; value: string; secondary?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
      {secondary && <dd className="mt-0.5 text-xs text-slate-500">{secondary}</dd>}
    </div>
  );
}

function FundingSummary({ request, balance, loading }: { request: ConEdRequest; balance?: BalanceInfo; loading: boolean }) {
  if (loading) return <Skeleton className="h-44 w-full" />;
  const remaining = balance?.remainingAmount ?? 0;
  const afterRequest = Math.max(0, remaining - request.totalRequested);
  const advance = Math.max(0, request.totalRequested - remaining);
  const otherPending = Math.max(0, (balance?.pendingAmount ?? 0) - request.totalRequested);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CircleDollarSign aria-hidden="true" className="h-4 w-4 text-primary" />
        {balance?.year ?? new Date().getFullYear()} CE balance
      </div>
      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Available now</dt><dd className="font-semibold tabular-nums">{formatCurrency(remaining)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">This request</dt><dd className="font-semibold tabular-nums">-{formatCurrency(request.totalRequested)}</dd></div>
        {otherPending > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-500">Other requests pending</dt><dd className="font-semibold tabular-nums text-amber-800">{formatCurrency(otherPending)}</dd></div>}
        <div className="border-t border-slate-200 pt-2.5 flex justify-between gap-3"><dt className="font-medium text-slate-700">Balance after</dt><dd className="font-bold tabular-nums">{formatCurrency(afterRequest)}</dd></div>
        {advance > 0 && <div className="flex justify-between gap-3 text-amber-800"><dt>Future CE advance</dt><dd className="font-bold tabular-nums">{formatCurrency(advance)}</dd></div>}
        {Boolean(balance?.carryoverDebt) && <div className="flex justify-between gap-3 text-amber-800"><dt>Existing carry-forward debt</dt><dd className="font-semibold tabular-nums">{formatCurrency(balance?.carryoverDebt)}</dd></div>}
      </dl>
    </div>
  );
}
