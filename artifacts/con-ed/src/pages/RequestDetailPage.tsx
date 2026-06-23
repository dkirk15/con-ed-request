import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { 
  useGetRequest, 
  useGetMe,
  getGetRequestQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Upload, FileText, Check, X, CreditCard, PenTool } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency, formatDate } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    mutationFn: ({ id, signedName }: { id: number, signedName: string }) => 
      customFetch(`/api/requests/${id}/repayment-guarantee`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedName }) 
      })
  });
};

const useMarkReimbursed = () => {
  return useMutation({
    mutationFn: ({ id, paycheckDate }: { id: number, paycheckDate: string }) => 
      customFetch(`/api/requests/${id}/reimburse`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paycheckDate }) 
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
  const { data: user } = useGetMe();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: request, isLoading } = useGetRequest(id, { 
    query: { enabled: !!id && !isNaN(id), queryKey: getGetRequestQueryKey(id) } 
  });

  const cancelMutation = useCancelRequest();
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
  const [paycheckDate, setPaycheckDate] = useState("");
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
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
          <Link href="/requests">
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 tracking-tight flex items-center gap-3">
              Request #{request.id}
              <StatusBadge status={request.status} />
            </h1>
            <p className="text-slate-500 mt-1">Submitted on {formatDate(request.createdAt)}</p>
          </div>
        </div>
        
        {/* Actions Menu */}
        <div className="flex flex-wrap gap-2">
          {isMyRequest && request.status === "draft" && (
            <Button
              onClick={async () => {
                try {
                  await customFetch(`/api/requests/${id}/submit`, { method: "POST", body: JSON.stringify({}) });
                  toast({ title: "Submitted", description: "Your request has been submitted for manager review." });
                  queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(id) });
                  queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
                } catch (err: any) {
                  toast({ title: "Error", description: err.message || "Failed to submit", variant: "destructive" });
                }
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Submit Request
            </Button>
          )}

          {isMyRequest && (request.status === "draft" || request.status === "pending_manager") && (
            <Button variant="destructive" onClick={() => handleAction(cancelMutation, id, "Request cancelled")}>
              Cancel Request
            </Button>
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
                    <Button variant="destructive" onClick={() => handleAction(managerDenyMutation, { id, reason: denyReason }, "Request denied")}>Confirm Denial</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button onClick={() => handleAction(managerApproveMutation, id, "Request approved by manager")} className="bg-green-600 hover:bg-green-700 text-white">
                <Check className="mr-2 h-4 w-4" /> Approve
              </Button>
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
                    <Button variant="destructive" onClick={() => handleAction(boDenyMutation, { id, reason: denyReason }, "Request denied")}>Confirm Denial</Button>
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

          {isMyRequest && request.status === "awaiting_receipt" && (user.role === "employee" || user.role === "manager") && (
            <>
              <input
                id="receipt-upload"
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,application/pdf"
              />
              {pendingReceiptFile ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 truncate max-w-[200px]" title={pendingReceiptFile.name}>
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
                    <Upload className="mr-2 h-4 w-4" />
                    {submitReceiptMutation.isPending ? "Submitting…" : "Submit Receipt"}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Upload Receipt
                </Button>
              )}
            </>
          )}

          {isAccounting && request.status === "receipt_submitted" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white"><CreditCard className="mr-2 h-4 w-4" /> Mark Reimbursed</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark as Reimbursed</DialogTitle>
                  <DialogDescription>Enter the paycheck date this reimbursement will be included in.</DialogDescription>
                </DialogHeader>
                <Input type="date" value={paycheckDate} onChange={e => setPaycheckDate(e.target.value)} />
                <DialogFooter>
                  <Button onClick={() => handleAction(markReimbursedMutation, { id, paycheckDate }, "Marked as reimbursed")}>Confirm Reimbursement</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isMyRequest && request.requiresRepaymentGuarantee && !request.repaymentGuarantee && request.status !== 'cancelled' && request.status !== 'manager_denied' && request.status !== 'bo_denied' && (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-amber-900 font-serif flex items-center gap-2"><PenTool className="h-5 w-5" /> Signature Required</CardTitle>
            <CardDescription className="text-amber-800">
              This request requires a repayment guarantee. Please sign below to proceed with processing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-4">
            <div className="flex-1 max-w-sm">
              <label className="text-sm font-medium text-amber-900 mb-1 block">Type your full name to sign</label>
              <Input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Full Name" className="border-amber-200 bg-white" />
            </div>
            <Button 
              onClick={() => handleAction(signRepaymentMutation, { id, signedName }, "Repayment guarantee signed")}
              disabled={!signedName || signRepaymentMutation.isPending}
            >
              Sign Agreement
            </Button>
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
                  <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Course Name(s)</h3>
                  <p className="text-lg font-medium text-slate-900">{request.courseNames}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Employee</h3>
                    <p className="font-medium">{request.employeeName}</p>
                    <p className="text-xs text-slate-400">{request.clinicName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Dates</h3>
                    <p className="font-medium">{request.courseDates || "TBD"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">Location</h3>
                    <p className="font-medium">{request.location || "Online"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">CEUs</h3>
                    <p className="font-medium">{request.ceuCount || "N/A"}</p>
                  </div>
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
                       <Button variant="outline" size="sm" asChild>
                         <a href={`/api/storage${receipt.fileUrl}`} target="_blank" rel="noreferrer">View</a>
                       </Button>
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
              <CardTitle className="font-serif">Status Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              
              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                
                <div className="relative">
                  <div className="absolute -left-[31px] bg-slate-200 p-1 rounded-full"><Check className="h-3 w-3 text-white" /></div>
                  <h4 className="text-sm font-semibold text-slate-900">Submitted</h4>
                  <p className="text-xs text-slate-500 mt-1">{formatDate(request.createdAt)} by {request.employeeName}</p>
                </div>

                {request.managerApprovedAt && (
                  <div className="relative">
                    <div className="absolute -left-[31px] bg-green-500 p-1 rounded-full"><Check className="h-3 w-3 text-white" /></div>
                    <h4 className="text-sm font-semibold text-slate-900">Manager Approved</h4>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(request.managerApprovedAt)} by {request.managerName}</p>
                  </div>
                )}
                {request.managerDeniedAt && (
                  <div className="relative">
                    <div className="absolute -left-[31px] bg-red-500 p-1 rounded-full"><X className="h-3 w-3 text-white" /></div>
                    <h4 className="text-sm font-semibold text-slate-900">Manager Denied</h4>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(request.managerDeniedAt)} by {request.managerName}</p>
                    <p className="text-xs mt-2 bg-red-50 text-red-800 p-2 rounded border border-red-100">{request.managerDenialReason}</p>
                  </div>
                )}

                {request.boApprovedAt && (
                  <div className="relative">
                    <div className="absolute -left-[31px] bg-green-500 p-1 rounded-full"><Check className="h-3 w-3 text-white" /></div>
                    <h4 className="text-sm font-semibold text-slate-900">Business Office Approved</h4>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(request.boApprovedAt)} by {request.boApproverName}</p>
                  </div>
                )}
                {request.boDeniedAt && (
                  <div className="relative">
                    <div className="absolute -left-[31px] bg-red-500 p-1 rounded-full"><X className="h-3 w-3 text-white" /></div>
                    <h4 className="text-sm font-semibold text-slate-900">Business Office Denied</h4>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(request.boDeniedAt)} by {request.boApproverName}</p>
                    <p className="text-xs mt-2 bg-red-50 text-red-800 p-2 rounded border border-red-100">{request.boDenialReason}</p>
                  </div>
                )}
                
                {request.receipts && request.receipts.length > 0 && (
                  <div className="relative">
                    <div className="absolute -left-[31px] bg-blue-500 p-1 rounded-full"><FileText className="h-3 w-3 text-white" /></div>
                    <h4 className="text-sm font-semibold text-slate-900">Receipts Submitted</h4>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(request.receipts[0].uploadedAt)}</p>
                  </div>
                )}

                {request.reimbursement && (
                  <div className="relative">
                    <div className="absolute -left-[31px] bg-green-500 p-1 rounded-full"><CreditCard className="h-3 w-3 text-white" /></div>
                    <h4 className="text-sm font-semibold text-slate-900">Reimbursed</h4>
                    <p className="text-xs text-slate-500 mt-1">Processed {formatDate(request.reimbursement.markedAt)}</p>
                    <p className="text-xs font-medium text-slate-700 mt-1">Paycheck Date: {formatDate(request.reimbursement.paycheckDate)}</p>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>
          
          {request.repaymentGuarantee && (
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
                <CardTitle className="text-sm font-serif">Repayment Guarantee</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="text-sm">
                  <div className="text-slate-500 mb-1">Electronically Signed By</div>
                  <div className="font-medium">{request.repaymentGuarantee.signedName}</div>
                  <div className="text-xs text-slate-400 mt-1">{formatDate(request.repaymentGuarantee.signedAt)}</div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
