import { useListRequests } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

export default function RequestsPage() {
  const { data: user } = useGetMe();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data: requests, isLoading } = useListRequests(
    statusFilter !== "all" ? { status: statusFilter } : {}
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">Requests</h1>
          <p className="text-slate-500 mt-1">Manage continuing education funding requests</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_manager">Pending Manager</SelectItem>
              <SelectItem value="manager_approved">Manager Approved</SelectItem>
              <SelectItem value="pending_bo">Pending BO</SelectItem>
              <SelectItem value="bo_approved">BO Approved</SelectItem>
              <SelectItem value="awaiting_receipt">Awaiting Receipt</SelectItem>
              <SelectItem value="receipt_submitted">Receipt Submitted</SelectItem>
              <SelectItem value="reimbursed">Reimbursed</SelectItem>
            </SelectContent>
          </Select>
          {(user?.role === "employee" || user?.role === "manager") && (
            <Link href="/requests/new">
              <Button className="bg-primary text-white hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" /> New Request
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : !requests || requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <FileText className="h-10 w-10 text-slate-300 mb-2" />
                    <p>No requests found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900 max-w-[200px] truncate" title={request.courseNames}>
                    {request.courseNames}
                    <div className="text-xs text-slate-500 font-normal">{request.courseDates || "TBD"}</div>
                  </TableCell>
                  <TableCell>
                    {request.employeeName}
                    <div className="text-xs text-slate-500">{request.clinicName}</div>
                  </TableCell>
                  <TableCell>{formatCurrency(request.totalRequested)}</TableCell>
                  <TableCell>{request.totalApproved != null ? formatCurrency(request.totalApproved) : "—"}</TableCell>
                  <TableCell><StatusBadge status={request.status} /></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/requests/${request.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
