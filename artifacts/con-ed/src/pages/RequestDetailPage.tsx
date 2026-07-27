import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { 
  useDeleteRequest,
  useGetRequest, 
  useGetMe,
  useReopenRequest,
  getGetRequestQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Upload, FileText, Check, X, CreditCard, ExternalLink, PenTool, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { DELIVERY_METHOD_LABELS, formatCourseDateRange, formatCurrency, formatDate } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { RepaymentGuaranteeDialog } from "@/components/RepaymentGuaranteeDialog";
import { RequestTimeline } from "@/components/RequestTimeline";
import { WorkflowSteps } from "@/components/WorkflowSteps";
import { ReceiptFileActions } from "@/components/ReceiptFileActions";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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

const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

function workflowStepForStatus(
  status: string,
): "request" | "manager" | "business_office" | "purchase" | "reimbursement" | "complete" {
  if (status === "pending_manager" || status === "manager_denied") return "manager";
  if (status === "manager_approved" || status === "pending_bo" || status === "bo_denied") {
    return "business_office";
  }
  if (status === "bo_approved" || status === "awaiting_receipt") return "purchase";
  if (status === "receipt_submitted") return "reimbursement";
  if (status === "reimbursed") return "complete";
  return "request";
}

// Adding local mutation definitions since they aren't fully typed out or readily available in our minimal check
const useCancelRequest = () => {
  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/requests/${id}/cancel`, { method: "POST" })
  });
};

const useManagerApproveRequest = () => {
  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/requests/${id}/manager-approve`, { method: "POST" })
  });
};

const useManagerDenyRequest = () => {
  return useMutation({
    mutationFn: ({ id, reason }: { id: number, reason: string }) => 
      customFetch(`/api/requests/${id}/manager-deny`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }) 
      })
  });
};

const useBoApproveRequest = () => {
  return useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => 
      customFetch(`/api/requests/${id}/bo-approve`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data) 
      })
  });
};

const useBoDenyRequest = () => {
  return useMutation({
    mutationFn: ({ id, reason }: { id: number, reason: string }) => 
      customFetch(`/api/requests/${id}/bo-deny`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }) 
      })
  });
};

const useSignRepaymentGuarantee = () => {
  return useMutation({
    mutationFn: ({ id, signedName, acknowledged }: { id: number, signedName: string, acknowledged: boolean }) => 
      customFetch(`/api/requests/${id}/repayment-guarantee`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedName, acknowledged }) 
      })
  });
};

const useMarkReimbursed = () => {
  return useMutation({
    mutationFn: ({ id, paycheckDate, amount }: { id: number, paycheckDate: string, amount: number }) =>
      customFetch(`/api/requests/${id}/reimburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paycheckDate, amount })
      })
  });
};

const useSubmitReceipt = () => {
  return useMutation({
    mutationFn: ({ id, fileUrl, fileName }: { id: number, fileUrl: string, fileName?: string }) => 
      customFetch(`/api/requests/${id}/receipts`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl, fileName }) 
      })
  });
};

export default function RequestDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: request, isLoading } = useGetRequest(id, { 
    query: { enabled: !!id && !isNaN(id), queryKey: getGetRequestQueryKey(id) } 
  });

  const cancelMutation = useCancelRequest();
  const deleteMutation = useDeleteRequest();
  const reopenMutation = useReopenRequest();
  const managerApproveMutation = useManagerApproveRequest();
  const managerDenyMutation = useManagerDenyRequest();
  const boApproveMutation = useBoApproveRequest();
  const boDenyMutation = useBoDenyRequest();
  const signRepaymentMutation = useSignRepaymentGuarantee();
  const markReimbursedMutation = useMarkReimbursed();
  const submitReceiptMutation = useSubmitReceipt();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [denyReason, setDenyReason] = useState("");
  const [signedName, setSignedName] = useState("");
  const [guaranteeAcknowledged, setGuaranteeAcknowledged] = useState(false);
  const [paycheckDate, setPaycheckDate] = useState("");
  const [reimbursementAmount, setReimbursementAmount] = useState(0);
  const [pendingReceiptFile, setPendingReceiptFile] = useState<File | null>(null);
  
  // BO Approval form state
  const [boApprovalData, setBoApprovalData] = useState({
    approvedTuition: 0,
    approvedLodging: 0,
    approvedAirfare: 0,
    approvedRentalCar: 0,
    approvedParking: 0,
    approvedOther: 0,
  });

  const handleAction = (mutationFn: any, payload?: any, successMsg = "Action successful") => {
    mutationFn.mutate(payload || id, {
      onSuccess: () => {
        toast({ title: "Success", description: successMsg });
        queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_RECEIPT_TYPES.has(file.type)) {
      toast({
        title: "Unsupported receipt type",
        description: "Choose a PDF, JPG, or PNG file.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      toast({
        title: "Receipt is too large",
        description: "Choose a file that is 10 MB or smaller.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    setPendingReceiptFile(file);
  };

  const handleReceiptSubmit = async () => {
    if (!pendingReceiptFile) return;

    try {
      // 1. Get presigned URL
      const urlRes = await customFetch<any>('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: id,
          name: pendingReceiptFile.name,
          size: pendingReceiptFile.size,
          contentType: pendingReceiptFile.type,
        })
      });

      // 2. Upload to object storage
      await fetch(urlRes.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': pendingReceiptFile.type },
        body: pendingReceiptFile,
      });

      // 3. Submit receipt to API
      handleAction(submitReceiptMutation, { 
        id, 
        fileUrl: urlRes.objectPath, 
        fileName: pendingReceiptFile.name 
      }, "Receipt submitted successfully");

      setPendingReceiptFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading || !request || !user) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-12">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-96 col-span-2" />
          <Skeleton className="h-96 col-span-1" />
        </div>
      </div>
    );
  }

  const isMyRequest = request.employeeId === user.id;
  const isManager = user.role === "manager" || user.role === "admin";
  const isBO = user.role === "business_office" || user.role === "admin";
  const isAccounting = user.role === "accounting" || user.role === "admin";

  const totalBoApproved = 
    (Number(boApprovalData.approvedTuition) || 0) +
    (Number(boApprovalData.approvedLodging) || 0) +
    (Number(boApprovalData.approvedAirfare) || 0) +
    (Number(boApprovalData.approvedRentalCar) || 0) +
    (Number(boApprovalData.approvedParking) || 0) +
    (Number(boApprovalData.approvedOther) || 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" className="h-8 w-8" asChild>
            <Link href="/requests" aria-label="Back to requests">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 tracking-tight flex items-center gap-3">
              Request #{request.id}
              <StatusBadge status={request.status} />
            </h1>
            <p className="text-slate-500 mt-1">Created on {formatDate(request.createdAt)}</p>
          </div>
        </div>
        
        {/* Actions Menu */}
        <div className="flex flex-wrap gap-2">
          {isMyRequest && request.status === "draft" && (
            <>
              <Button asChild>
                <Link href={`/requests/${id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                  Continue editing
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Delete draft
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the request. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep draft</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteMutation.mutate(
                        { requestId: id },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
                            toast({ title: "Draft deleted", description: "The draft has been permanently removed." });
                            setLocation("/requests?status=draft");
                          },
                          onError: (error: unknown) => toast({
                            title: "Draft was not deleted",
                            description: error instanceof Error ? error.message : "Try again.",
                            variant: "destructive",
                          }),
                        },
                      )}
                    >
                      Delete draft
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {isMyRequest && (request.status === "manager_denied" || request.status === "bo_denied") && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Re-open for revision
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Re-open this request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This returns the request to draft so you can edit and resubmit it.
                    {request.status === "bo_denied"
                      ? " Because the manager already approved it, resubmitting will go directly to CE review — no manager re-approval needed."
                      : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep as-is</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={reopenMutation.isPending}
                    onClick={() =>
                      reopenMutation.mutate(
                        { requestId: id },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(id) });
                            queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
                            toast({ title: "Request re-opened", description: "You can now edit and resubmit your request." });
                            setLocation(`/requests/${id}/edit`);
                          },
                          onError: (err: unknown) =>
                            toast({
                              title: "Could not re-open",
                              description: err instanceof Error ? err.message : "Please try again.",
                              variant: "destructive",
                            }),
                        },
                      )
                    }
                  >
                    Re-open for revision
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {isMyRequest && request.status === "pending_manager" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Cancel request</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the request from the approval process. The action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Request</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleAction(cancelMutation, id, "Request cancelled")}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Cancel request
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {isManager && request.status === "pending_manager" && (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50"><X className="mr-2 h-4 w-4" /> Deny</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Deny Request</DialogTitle>
                    <DialogDescription>Please provide a reason for denying this request.</DialogDescription>
                  </DialogHeader>
                  <Textarea value={denyReason} onChange={e => setDenyReason(e.target.value)} placeholder="Reason for denial..." />
                  <DialogFooter>
                    <Button
                      variant="destructive"
                      disabled={!denyReason.trim() || managerDenyMutation.isPending}
                      onClick={() => handleAction(managerDenyMutation, { id, reason: denyReason.trim() }, "Request denied")}
                    >
                      Confirm Denial
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700 text-white">
                    <Check className="mr-2 h-4 w-4" /> Approve
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve request #{request.id}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {request.employeeName}&apos;s {formatCurrency(request.totalRequested)} request will move to the Business Office queue. Your name and approval time will be recorded.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Go Back</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={managerApproveMutation.isPending}
                      onClick={() => handleAction(managerApproveMutation, id, "Request approved by manager")}
                    >
                      Confirm Approval
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {isBO && request.status === "pending_bo" && (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50"><X className="mr-2 h-4 w-4" /> Deny</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Deny Request</DialogTitle>
                    <DialogDescription>Please provide a reason for denying this request.</DialogDescription>
                  </DialogHeader>
                  <Textarea value={denyReason} onChange={e => setDenyReason(e.target.value)} placeholder="Reason for denial..." />
                  <DialogFooter>
                    <Button
                      variant="destructive"
                      disabled={!denyReason.trim() || boDenyMutation.isPending}
                      onClick={() => handleAction(boDenyMutation, { id, reason: denyReason.trim() }, "Request denied")}
                    >
                      Confirm Denial
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Dialog onOpenChange={(open) => {
                if(open) {
                  setBoApprovalData({
                    approvedTuition: request.tuition || 0,
                    approvedLodging: request.lodging || 0,
                    approvedAirfare: request.airfare || 0,
                    approvedRentalCar: request.rentalCar || 0,
                    approvedParking: request.parking || 0,
                    approvedOther: request.otherCosts || 0,
                  });
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Check className="mr-2 h-4 w-4" /> Final Approve
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Business Office Approval</DialogTitle>
                    <DialogDescription>Set the final approved funding amounts.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    {["Tuition", "Lodging", "Airfare", "RentalCar", "Parking", "Other"].map(field => (
                      <div key={field} className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm font-medium col-span-1">{field}</label>
                        <Input 
                          type="number" 
                          className="col-span-3" 
                          value={boApprovalData[`approved${field}` as keyof typeof boApprovalData]} 
                          onChange={(e) => setBoApprovalData(prev => ({...prev, [`approved${field}`]: parseFloat(e.target.value) || 0}))} 
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-4 items-center gap-4 mt-2 pt-2 border-t font-bold">
                      <div className="text-right text-sm col-span-1">Total</div>
                      <div className="col-span-3 pl-3">{formatCurrency(totalBoApproved)}</div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => handleAction(boApproveMutation, { id, data: { ...boApprovalData, totalApproved: totalBoApproved } }, "Request approved by CE")}>
                      Confirm Approval
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          {isAccounting && request.status === "receipt_submitted" && (
            <Dialog onOpenChange={(open) => {
              if (open) {
                setReimbursementAmount(request.totalApproved ?? request.totalRequested);
                setPaycheckDate("");
              }
            }}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white"><CreditCard className="mr-2 h-4 w-4" /> Mark Reimbursed</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark as Reimbursed</DialogTitle>
                  <DialogDescription>Enter the paycheck date this reimbursement will be included in.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="detail-reimbursement-amount" className="mb-1.5 block text-sm font-medium">Actual reimbursement amount</label>
                    <Input
                      id="detail-reimbursement-amount"
                      type="number"
                      min="0.01"
                      max={request.totalApproved ?? request.totalRequested}
                      step="0.01"
                      value={reimbursementAmount}
                      onChange={e => setReimbursementAmount(Math.max(0, Number(e.target.value) || 0))}
                    />
                    {reimbursementAmount < (request.totalApproved ?? request.totalRequested) && reimbursementAmount > 0 && (
                      <p className="mt-1.5 text-sm text-emerald-700">
                        {formatCurrency((request.totalApproved ?? request.totalRequested) - reimbursementAmount)} will return to the employee&apos;s CE balance.
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="detail-paycheck-date" className="mb-1.5 block text-sm font-medium">Paycheck date</label>
                    <Input id="detail-paycheck-date" type="date" value={paycheckDate} onChange={e => setPaycheckDate(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={
                      !paycheckDate ||
                      reimbursementAmount <= 0 ||
                      reimbursementAmount > (request.totalApproved ?? request.totalRequested) ||
                      markReimbursedMutation.isPending
                    }
                    onClick={() => handleAction(markReimbursedMutation, { id, paycheckDate, amount: reimbursementAmount }, "Marked as reimbursed")}
                  >
                    Confirm Reimbursement
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <WorkflowSteps current={workflowStepForStatus(request.status)} />

      {isMyRequest && request.status === "awaiting_receipt" && (user.role === "employee" || user.role === "manager") && (
        <section
          className="flex flex-col gap-5 rounded-md border border-orange-200 bg-orange-50 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between"
          aria-labelledby="receipt-next-step-heading"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 rounded-md bg-orange-100 p-2 text-primary">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="receipt-next-step-heading" className="font-serif text-lg font-semibold text-slate-950">
                Ready for your receipt
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                Your course is approved. After making the purchase, upload the itemized receipt to begin reimbursement.
              </p>
            </div>
          </div>
          <input
            id="receipt-upload"
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          />
          {pendingReceiptFile ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
              <span className="max-w-[220px] truncate text-sm font-medium text-slate-700" title={pendingReceiptFile.name}>
                {pendingReceiptFile.name}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPendingReceiptFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Change
              </Button>
              <Button
                onClick={handleReceiptSubmit}
                disabled={submitReceiptMutation.isPending}
              >
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {submitReceiptMutation.isPending ? "Submitting…" : "Submit receipt"}
              </Button>
            </div>
          ) : (
            <Button className="shrink-0 md:self-center" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              Upload receipt
            </Button>
          )}
        </section>
      )}

      {isMyRequest && request.status === "receipt_submitted" && (
        <section
          className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4"
          aria-labelledby="receipt-submitted-heading"
        >
          <div className="mt-0.5 rounded-md bg-emerald-100 p-2 text-emerald-700">
            <Check className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="receipt-submitted-heading" className="font-serif text-lg font-semibold text-emerald-950">
              Receipt submitted
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              Accounting will review the receipt and record the reimbursement on an upcoming paycheck.
            </p>
          </div>
        </section>
      )}

      {isMyRequest && request.requiresRepaymentGuarantee && !request.repaymentGuarantee && request.status !== 'cancelled' && request.status !== 'manager_denied' && request.status !== 'bo_denied' && (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-amber-900 font-serif flex items-center gap-2"><PenTool className="h-5 w-5" /> OSS Repayment Policy</CardTitle>
            <CardDescription className="text-amber-800 leading-relaxed">
              Olympic Sports &amp; Spine (OSS) has advanced to me continuing education funding upon my request. To reimburse OSS for this advance, I agree to designate continuing education benefits that will be accrued through my future work hours in the amount necessary to satisfy this debt. In the event that my employment with OSS is terminated, either voluntarily or involuntarily, I agree to repay OSS for any advanced continuing education balance that remains unsatisfied after all future benefit accruals are applied.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={guaranteeAcknowledged}
                onCheckedChange={(checked) => setGuaranteeAcknowledged(checked === true)}
                className="mt-0.5 border-amber-400 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
              />
              <span className="text-sm text-amber-900">
                I agree to conduct business electronically and understand that typing my name below acts as my legally binding signature to the full terms of this OSS Repayment Policy.
              </span>
            </label>
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-sm">
                <label className="text-sm font-medium text-amber-900 mb-1 block">Type your full name to sign</label>
                <Input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Full Name" className="border-amber-200 bg-white" />
              </div>
              <Button 
                onClick={() => handleAction(signRepaymentMutation, { id, signedName: signedName.trim(), acknowledged: guaranteeAcknowledged }, "Repayment guarantee signed")}
                disabled={!signedName.trim() || !guaranteeAcknowledged || signRepaymentMutation.isPending}
              >
                Sign Agreement
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="font-serif">Course Information</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Course name</h3>
                  <p className="text-lg font-medium text-slate-900">{request.courseNames}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Employee</h3>
                    <p className="font-medium">{request.employeeName}</p>
                    <p className="text-xs text-slate-400">{request.clinicName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Provider</h3>
                    <p className="font-medium">{request.courseProvider || "Not provided"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Course dates</h3>
                    <p className="font-medium">{formatCourseDateRange(request.courseStartDate, request.courseEndDate, request.courseDates)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Delivery</h3>
                    <p className="font-medium">{request.deliveryMethod ? DELIVERY_METHOD_LABELS[request.deliveryMethod] : "Not provided"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Location</h3>
                    <p className="font-medium">{request.location || (request.deliveryMethod === "virtual" ? "Online" : "Not provided")}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">CEUs</h3>
                    <p className="font-medium">{request.ceuCount || "N/A"}</p>
                  </div>
                  {request.courseUrl && (
                    <div className="col-span-2 sm:col-span-3">
                      <a href={request.courseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                        Open course webpage <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="font-serif">Financial Details</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Category</th>
                    <th className="px-6 py-3 text-right font-medium">Requested</th>
                    <th className="px-6 py-3 text-right font-medium">Approved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-6 py-3 font-medium">Tuition / Registration</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(request.tuition)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{request.approvedTuition != null ? formatCurrency(request.approvedTuition) : "-"}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 font-medium">Lodging</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(request.lodging)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{request.approvedLodging != null ? formatCurrency(request.approvedLodging) : "-"}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 font-medium">Airfare</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(request.airfare)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{request.approvedAirfare != null ? formatCurrency(request.approvedAirfare) : "-"}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 font-medium">Rental Car</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(request.rentalCar)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{request.approvedRentalCar != null ? formatCurrency(request.approvedRentalCar) : "-"}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 font-medium">Parking / Tolls</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(request.parking)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{request.approvedParking != null ? formatCurrency(request.approvedParking) : "-"}</td>
                  </tr>
                  {((request.otherCosts != null && request.otherCosts > 0) || (request.approvedOther != null && request.approvedOther > 0)) && (
                    <tr>
                      <td className="px-6 py-3 font-medium">Other Costs</td>
                      <td className="px-6 py-3 text-right">{formatCurrency(request.otherCosts)}</td>
                      <td className="px-6 py-3 text-right text-slate-500">{formatCurrency(request.approvedOther)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-6 py-4">Total</td>
                    <td className="px-6 py-4 text-right text-base">{formatCurrency(request.totalRequested)}</td>
                    <td className="px-6 py-4 text-right text-base text-primary">{request.totalApproved != null ? formatCurrency(request.totalApproved) : "Pending"}</td>
                  </tr>
                  {request.reimbursement && (
                    <tr className="bg-emerald-50 font-bold text-emerald-900">
                      <td className="px-6 py-4">Actual Reimbursement</td>
                      <td className="px-6 py-4 text-right text-slate-400">-</td>
                      <td className="px-6 py-4 text-right text-base">
                        {formatCurrency(request.reimbursement.amount ?? request.totalApproved)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {request.receipts && request.receipts.length > 0 && (
             <Card className="shadow-sm border-slate-200">
               <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                 <CardTitle className="font-serif">Receipts</CardTitle>
               </CardHeader>
               <CardContent className="p-6">
                 <div className="space-y-3">
                   {request.receipts.map((receipt, i) => (
                     <div key={receipt.id} className="flex items-center justify-between p-3 border rounded-lg">
                       <div className="flex items-center gap-3">
                         <FileText className="text-slate-400" />
                         <div>
                           <div className="font-medium text-sm">{receipt.fileName || `Receipt ${i+1}`}</div>
                           <div className="text-xs text-slate-500">Uploaded {formatDate(receipt.uploadedAt)}</div>
                         </div>
                       </div>
                       <ReceiptFileActions receipt={receipt} />
                     </div>
                   ))}
                 </div>
               </CardContent>
             </Card>
          )}

        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="font-serif">Request Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <RequestTimeline request={request} />
            </CardContent>
          </Card>
          
          {request.repaymentGuarantee && (
            <RepaymentGuaranteeDialog guarantees={[request.repaymentGuarantee]}>
              <button type="button" className="w-full text-left">
                <Card className="shadow-sm border-slate-200 transition hover:border-primary/40 hover:shadow cursor-pointer">
                  <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
                    <CardTitle className="text-sm font-serif flex items-center justify-between gap-2">
                      Repayment Guarantee
                      <span className="text-xs font-sans font-normal text-primary">View agreement →</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="text-sm">
                      <div className="text-slate-500 mb-1">Electronically Signed By</div>
                      <div className="font-medium">{request.repaymentGuarantee.signedName}</div>
                      <div className="text-xs text-slate-400 mt-1">{formatDate(request.repaymentGuarantee.signedAt)}</div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            </RepaymentGuaranteeDialog>
          )}

        </div>
      </div>

    </div>
  );
}
