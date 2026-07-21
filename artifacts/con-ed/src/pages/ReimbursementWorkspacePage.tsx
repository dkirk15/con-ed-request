import { type FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  type ConEdRequest,
  type ListRequestsParams,
  customFetch,
  getGetRequestQueryKey,
  getListClinicsQueryKey,
  getListRequestsQueryKey,
  useGetMe,
  useGetRequest,
  useListClinics,
  useListRequests,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  History,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
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
import { Button } from "@/components/ui/button";
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
import { RequestTimeline } from "@/components/RequestTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { DELIVERY_METHOD_LABELS, formatCourseDateRange, formatCurrency, formatDateTime } from "@/lib/constants";

function requestAge(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"}`;
}

export default function ReimbursementWorkspacePage() {
  const { data: user } = useGetMe();
  const canProcess = user?.role === "accounting" || user?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const [amount, setAmount] = useState(0);
  const [paycheckDate, setPaycheckDate] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clinicId = searchParams.get("clinicId");
  const selectedId = Number(searchParams.get("selected")) || 0;
  const queryParams: ListRequestsParams = {
    status: "receipt_submitted",
    page: 1,
    pageSize: 100,
    sort: "updatedAt",
    order: "asc",
    ...(searchParams.get("search") ? { search: searchParams.get("search")! } : {}),
    ...(clinicId ? { clinicId: Number(clinicId) } : {}),
  };

  const queueQuery = useListRequests(queryParams, {
    query: { enabled: Boolean(canProcess), queryKey: getListRequestsQueryKey(queryParams) },
  });
  const clinicsQuery = useListClinics({
    query: { enabled: Boolean(canProcess), queryKey: getListClinicsQueryKey() },
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
    if (canProcess && !queueQuery.isLoading && requests.length > 0 && !selectedId) {
      setParams({ selected: String(requests[0].id) });
    }
  }, [canProcess, queueQuery.isLoading, requests, selectedId]);

  useEffect(() => {
    if (canProcess && !queueQuery.isLoading && selectedId && !requests.some((item) => item.id === selectedId)) {
      setParams({ selected: requests[0] ? String(requests[0].id) : null });
    }
  }, [canProcess, queueQuery.isLoading, requests, selectedId]);

  const requestQuery = useGetRequest(selectedId, {
    query: { enabled: Boolean(canProcess && selectedId), queryKey: getGetRequestQueryKey(selectedId) },
  });
  const request = requestQuery.data;
  const approvedAmount = request?.totalApproved ?? request?.totalRequested ?? 0;

  useEffect(() => {
    if (request) {
      setAmount(request.totalApproved ?? request.totalRequested);
      setPaycheckDate("");
    }
  }, [request?.id]);

  const reimburseMutation = useMutation({
    mutationFn: ({ requestId, reimbursementAmount, date }: { requestId: number; reimbursementAmount: number; date: string }) =>
      customFetch(`/api/requests/${requestId}/reimburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: reimbursementAmount, paycheckDate: date }),
      }),
  });

  const openNextAfter = (completedId: number) => {
    const nextRequest = requests.find((item) => item.id !== completedId);
    queryClient.setQueriesData<{ items: ConEdRequest[]; total: number }>(
      { queryKey: ["/api/requests"], exact: false },
      (old) => {
        if (!old) return old;
        const filtered = old.items.filter((item) => item.id !== completedId);
        return {
          ...old,
          items: filtered,
          total: filtered.length < old.items.length ? Math.max(0, old.total - 1) : old.total,
        };
      },
    );
    queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    toast({
      title: "Reimbursement recorded",
      description: nextRequest ? "The next receipt is ready for review." : "The reimbursement queue is clear.",
    });
    setParams({ selected: nextRequest ? String(nextRequest.id) : null });
  };

  const recordReimbursement = () => {
    if (!request || !paycheckDate || amount <= 0 || amount > approvedAmount) return;
    reimburseMutation.mutate(
      { requestId: request.id, reimbursementAmount: amount, date: paycheckDate },
      {
        onSuccess: () => openNextAfter(request.id),
        onError: (error: unknown) => toast({
          title: "Reimbursement was not recorded",
          description: error instanceof Error ? error.message : "Try again.",
          variant: "destructive",
        }),
      },
    );
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setParams({ search: searchValue.trim() || null, selected: null });
  };

  if (user && !canProcess) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <WalletCards aria-hidden="true" className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-2xl font-serif font-bold text-slate-950">Reimbursement workspace unavailable</h1>
        <p className="mt-2 text-slate-500">This workspace is for Accounting.</p>
      </div>
    );
  }

  const totalApprovedWaiting = requests.reduce(
    (total, item) => total + (item.totalApproved ?? item.totalRequested),
    0,
  );

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Continuing Education</p>
          <h1 className="mt-1 text-3xl font-serif font-bold text-slate-950">Reimbursement Queue</h1>
          <p className="mt-1 text-slate-500">Reconcile approved funding with receipts and record the paycheck reimbursement.</p>
        </div>
        <div className="flex items-center gap-5 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Waiting</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-950">{queueQuery.data?.total ?? 0}</div>
          </div>
          <div className="h-9 w-px bg-slate-200" />
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Approved value</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(totalApprovedWaiting)}</div>
          </div>
          <div className="h-9 w-px bg-slate-200" />
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Oldest receipt</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Clock3 aria-hidden="true" className="h-4 w-4 text-amber-600" />
              {requests[0] ? requestAge(requests[0].updatedAt) : "Queue clear"}
            </div>
          </div>
        </div>
      </header>

      <section className="grid min-h-[680px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-13rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <form onSubmit={submitSearch} className="flex">
              <Input
                aria-label="Search reimbursement queue"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search receipts"
                className="rounded-r-none bg-white"
              />
              <Button type="submit" variant="outline" size="icon" className="-ml-px shrink-0 rounded-l-none" aria-label="Search">
                <Search aria-hidden="true" />
              </Button>
            </form>
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
            <Button asChild variant="ghost" size="sm" className="w-full justify-start text-slate-600">
              <Link href="/requests?status=reimbursed"><History aria-hidden="true" /> View reimbursement history</Link>
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2" role="list" aria-label="Requests awaiting reimbursement">
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
                    {searchParams.get("search") || clinicId ? "No reimbursements match these filters." : "There are no receipts waiting for Accounting."}
                  </p>
                  {(searchParams.get("search") || clinicId) && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setParams({ search: null, clinicId: null, selected: null })}>Clear filters</Button>
                  )}
                </div>
              ) : requests.map((item) => {
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
                        <span className="text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(item.totalApproved ?? item.totalRequested)}</span>
                        <span className="text-xs text-slate-500">Receipt {requestAge(item.updatedAt)} ago</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          {!selectedId || (!requestQuery.isLoading && !request) ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div>
                <ReceiptText aria-hidden="true" className="mx-auto h-10 w-10 text-slate-300" />
                <h2 className="mt-4 text-xl font-serif font-bold text-slate-900">Select a receipt to process</h2>
                <p className="mt-1 text-sm text-slate-500">Receipt and approved funding details will appear here.</p>
              </div>
            </div>
          ) : requestQuery.isLoading || !request ? (
            <div className="space-y-5 p-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-72 w-full" /></div>
          ) : (
            <ReimbursementPane
              request={request}
              amount={amount}
              setAmount={setAmount}
              paycheckDate={paycheckDate}
              setPaycheckDate={setPaycheckDate}
              recordReimbursement={recordReimbursement}
              pending={reimburseMutation.isPending}
            />
          )}
        </main>
      </section>
    </div>
  );
}

function ReimbursementPane({
  request,
  amount,
  setAmount,
  paycheckDate,
  setPaycheckDate,
  recordReimbursement,
  pending,
}: {
  request: ConEdRequest;
  amount: number;
  setAmount: (amount: number) => void;
  paycheckDate: string;
  setPaycheckDate: (date: string) => void;
  recordReimbursement: () => void;
  pending: boolean;
}) {
  const approved = request.totalApproved ?? request.totalRequested;
  const released = Math.max(0, approved - amount);
  const exceedsApproved = amount > approved;
  const receiptMissing = !request.receipts?.length;
  const canSubmit = amount > 0 && !exceedsApproved && Boolean(paycheckDate) && !receiptMissing && !pending;

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-slate-200">
          <section className="p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="text-sm font-medium text-slate-500">Request #{request.id}</span><StatusBadge status={request.status} /></div>
                <h2 className="mt-2 text-2xl font-serif font-bold text-slate-950">{request.courseNames}</h2>
                <p className="mt-1 text-sm text-slate-500">{request.employeeName} - {request.clinicName || "No clinic"}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span>{request.courseProvider || "Provider not provided"}</span>
                  <span>{formatCourseDateRange(request.courseStartDate, request.courseEndDate, request.courseDates)}</span>
                  <span>{request.deliveryMethod ? DELIVERY_METHOD_LABELS[request.deliveryMethod] : "Delivery not provided"}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium uppercase text-slate-500">Approved</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{formatCurrency(approved)}</div>
              </div>
            </div>
          </section>

          <section className="p-6">
            <h3 className="text-lg font-serif font-bold text-slate-950">Funding reconciliation</h3>
            <p className="mt-1 text-sm text-slate-500">Record what OSS will actually reimburse from the approved funding.</p>
            <div className="mt-5 grid overflow-hidden rounded-md border border-slate-200 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <AmountStep label="Requested" amount={request.totalRequested} />
              <div className="hidden items-center justify-center bg-slate-50 px-2 sm:flex"><ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-300" /></div>
              <AmountStep label="BO approved" amount={approved} />
              <div className="hidden items-center justify-center bg-slate-50 px-2 sm:flex"><ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-300" /></div>
              <AmountStep label="Actual reimbursement" amount={amount} emphasis />
            </div>
          </section>

          <section className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="flex items-center gap-2">
                <ReceiptText aria-hidden="true" className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-serif font-bold text-slate-950">Submitted receipt</h3>
              </div>
              <div className="mt-4 space-y-3">
                {receiptMissing ? (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                    <AlertTitle>Receipt file missing</AlertTitle>
                    <AlertDescription>This request cannot be reimbursed until its receipt file is available.</AlertDescription>
                  </Alert>
                ) : request.receipts!.map((receipt, index) => (
                  <div key={receipt.id} className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded bg-slate-100 p-2"><FileCheck2 aria-hidden="true" className="h-5 w-5 text-slate-600" /></div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{receipt.fileName || `Receipt ${index + 1}`}</div>
                        <div className="mt-0.5 text-xs text-slate-500">Uploaded {formatDateTime(receipt.uploadedAt)}</div>
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/storage${receipt.fileUrl}`} download={receipt.fileName || `receipt-${index + 1}`}>
                        <Download aria-hidden="true" /> Download
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><WalletCards aria-hidden="true" className="h-4 w-4 text-primary" /> Reimbursement details</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="actual-reimbursement" className="text-sm font-medium text-slate-800">Actual amount</label>
                    <button type="button" onClick={() => setAmount(approved)} className="text-xs font-medium text-primary hover:underline">Use approved amount</button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <Input
                      id="actual-reimbursement"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))}
                      className="bg-white pl-7 text-right tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="paycheck-date" className="mb-1.5 block text-sm font-medium text-slate-800">Paycheck date</label>
                  <div className="relative">
                    <CalendarDays aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="paycheck-date" type="date" value={paycheckDate} onChange={(event) => setPaycheckDate(event.target.value)} className="bg-white pl-9" />
                  </div>
                </div>
              </div>

              {exceedsApproved && <p className="mt-3 text-sm font-medium text-red-700">Amount cannot exceed the {formatCurrency(approved)} approval.</p>}
              {released > 0 && !exceedsApproved && (
                <Alert className="mt-4 border-emerald-200 bg-emerald-50 text-emerald-950">
                  <CircleDollarSign aria-hidden="true" className="h-4 w-4 text-emerald-700" />
                  <AlertTitle>{formatCurrency(released)} will be released</AlertTitle>
                  <AlertDescription>Unused approved funding will return to the employee&apos;s CE balance.</AlertDescription>
                </Alert>
              )}
            </div>
          </section>

          <section className="p-6">
            <h3 className="text-lg font-serif font-bold text-slate-950">Audit timeline</h3>
            <p className="mt-1 text-sm text-slate-500">Recorded approval, receipt, and reimbursement activity.</p>
            <div className="mt-5 max-w-2xl"><RequestTimeline request={request} /></div>
          </section>
        </div>
      </ScrollArea>

      <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]">
        <div className="text-sm text-slate-500">Your name, the actual amount, and paycheck date will be recorded.</div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={!canSubmit}><Check aria-hidden="true" /> Record reimbursement and open next <ArrowRight aria-hidden="true" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Record {formatCurrency(amount)} reimbursement?</AlertDialogTitle>
              <AlertDialogDescription>
                This will close request #{request.id} as reimbursed on the {paycheckDate || "selected"} paycheck.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="font-medium text-slate-900">{request.courseNames}</div>
              <div className="mt-1 text-slate-500">{request.employeeName} - {request.clinicName || "No clinic"}</div>
              {released > 0 && <div className="mt-2 font-medium text-emerald-700">{formatCurrency(released)} returns to the employee&apos;s CE balance.</div>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Go back</AlertDialogCancel>
              <AlertDialogAction onClick={recordReimbursement} disabled={!canSubmit}>Confirm reimbursement</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </footer>
    </>
  );
}

function AmountStep({ label, amount, emphasis = false }: { label: string; amount: number; emphasis?: boolean }) {
  return (
    <div className={`p-4 ${emphasis ? "bg-emerald-50" : "bg-white"}`}>
      <div className={`text-xs font-medium uppercase ${emphasis ? "text-emerald-700" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${emphasis ? "text-emerald-900" : "text-slate-900"}`}>{formatCurrency(amount)}</div>
    </div>
  );
}
