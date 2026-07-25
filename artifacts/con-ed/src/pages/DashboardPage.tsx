import { useGetMe, useGetEmployeeDashboard, useGetManagerDashboard, useGetBoDashboard, useGetAccountingDashboard, useGetAdminDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCourseDateRange, formatCurrency } from "@/lib/constants";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, Clock, CheckCircle2, XCircle, CreditCard } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import TaskCenterPanel from "@/components/TaskCenterPanel";

export default function DashboardPage() {
  const { data: user, isLoading: isUserLoading } = useGetMe();

  if (isUserLoading || !user) {
    return <DashboardSkeleton />;
  }

  const title = user.role === "admin" ? "Operations" : "Overview";
  const descriptions: Record<string, string> = {
    employee: "Your CE funding, requests, and next steps.",
    manager: "Review clinic requests and track your own CE funding.",
    business_office: "Make CE funding decisions and monitor approved requests.",
    accounting: "Process reimbursements that have complete receipts.",
    admin: "Monitor access, assignments, and the CE request workflow.",
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Continuing Education
          </p>
          <h1 className="mt-1 text-3xl font-serif font-bold text-slate-950">{title}</h1>
          <p className="mt-1 text-slate-500">
            {descriptions[user.role]} Welcome back, {user.name}.
          </p>
        </div>
        
        {user.role === "employee" || user.role === "manager" ? (
          <Link href="/requests/new">
            <Button className="bg-primary text-white hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> New Request
            </Button>
          </Link>
        ) : null}
      </div>

      <TaskCenterPanel role={user.role} />

      {user.role === "employee" && <EmployeeDashboard />}
      {user.role === "manager" && <ManagerDashboard />}
      {user.role === "business_office" && <BODashboard />}
      {user.role === "accounting" && <AccountingDashboard />}
      {user.role === "admin" && <AdminDashboard />}
    </div>
  );
}

function EmployeeDashboard() {
  const { data, isLoading } = useGetEmployeeDashboard();

  if (isLoading || !data) return <DashboardSkeleton />;

  const { balance, requestCounts, recentRequests } = data;
  const availableAllocation = balance.availableAllocation ?? balance.annualAllocation;
  const percentUsed =
    availableAllocation > 0
      ? Math.min(100, Math.round((balance.usedAmount / availableAllocation) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 md:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-serif">Annual Allocation ({balance.year})</CardTitle>
            <CardDescription>Your continuing education funding</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end mb-2">
              <div className="text-3xl font-bold text-slate-900">{formatCurrency(balance.remainingAmount)} <span className="text-base font-normal text-slate-500">remaining</span></div>
              <div className="text-right text-sm text-slate-500">
                {formatCurrency(balance.usedAmount)} used of {formatCurrency(availableAllocation)}
              </div>
            </div>
            <Progress value={percentUsed} className="h-3 rounded-full bg-slate-100" />
            {balance.carryoverDebt ? (
              <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatCurrency(balance.carryoverDebt)} carry-forward advance applied
              </p>
            ) : null}
            {balance.pendingAmount ? (
              <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatCurrency(balance.pendingAmount)} currently pending approval
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /> Pending</span>
              <span className="font-semibold">{requestCounts.pending}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Approved</span>
              <span className="font-semibold">{requestCounts.approved}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 flex items-center gap-2"><CreditCard className="h-4 w-4 text-blue-500" /> Reimbursed</span>
              <span className="font-semibold">{requestCounts.reimbursed}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-serif">Recent Requests</CardTitle>
            <CardDescription>Your most recently updated funding requests</CardDescription>
          </div>
          <Link href="/requests">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p>You haven't submitted any requests yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentRequests.map(req => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="mb-2 sm:mb-0">
                    <h4 className="font-medium text-slate-900 line-clamp-1">{req.courseNames}</h4>
                    <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{formatCourseDateRange(req.courseStartDate, req.courseEndDate, req.courseDates)}</span>
                      <span>•</span>
                      <span>
                        {req.status === "reimbursed"
                          ? `${formatCurrency(req.reimbursement?.amount ?? req.totalApproved ?? req.totalRequested)} reimbursed`
                          : formatCurrency(req.totalRequested)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={req.status} />
                    <Link href={`/requests/${req.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ManagerDashboard() {
  const { data, isLoading } = useGetManagerDashboard();

  if (isLoading || !data) return <DashboardSkeleton />;

  const { myBalance, myRecentRequests = [], requestCounts, clinicEmployeeCount } = data;
  const availableAllocation = myBalance.availableAllocation ?? myBalance.annualAllocation;
  const percentUsed =
    availableAllocation > 0
      ? Math.min(100, Math.round((myBalance.usedAmount / availableAllocation) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/approvals" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full border-amber-200 bg-amber-50/70 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50">
            <CardContent className="p-6">
              <div className="flex flex-col">
                <span className="text-amber-800 text-sm font-medium mb-1 flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Action Required
                </span>
                <span className="text-3xl font-bold text-amber-900">{requestCounts.pendingMyApproval}</span>
                <span className="text-amber-700/80 text-xs mt-1">Requests pending your approval</span>
              </div>
            </CardContent>
          </Card>
        </Link>
        
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm font-medium mb-1">Approved This Year</span>
              <span className="text-3xl font-bold text-slate-900">{requestCounts.approvedThisYear}</span>
              <span className="text-slate-400 text-xs mt-1">From your clinic</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm font-medium mb-1">Total Clinic Spend</span>
              <span className="text-3xl font-bold text-slate-900">{formatCurrency(requestCounts.totalClinicSpend)}</span>
              <span className="text-slate-400 text-xs mt-1">YTD Approved</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm font-medium mb-1">Team Size</span>
              <span className="text-3xl font-bold text-slate-900">{clinicEmployeeCount}</span>
              <span className="text-slate-400 text-xs mt-1">Employees in your clinic</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="grid gap-5 p-6 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)] md:items-center">
          <div>
            <div className="font-serif text-lg font-semibold text-slate-900">My Annual Allocation</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(myBalance.remainingAmount)}</div>
            <div className="mt-1 text-sm text-slate-500">Remaining of {formatCurrency(availableAllocation)}</div>
            {myBalance.carryoverDebt ? (
              <div className="mt-2 text-xs text-amber-700">
                {formatCurrency(myBalance.carryoverDebt)} carry-forward advance applied
              </div>
            ) : null}
          </div>
          <div>
            <Progress value={percentUsed} className="h-2 rounded-full bg-slate-100" />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{percentUsed}% used</span>
              <Link href="/account" className="font-medium text-primary hover:underline">View my profile</Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-serif">My Recent Requests</CardTitle>
            <CardDescription>Your most recently updated CE funding requests</CardDescription>
          </div>
          <Link href="/requests">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {myRecentRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p>You haven't submitted any requests yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myRecentRequests.map(req => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="mb-2 sm:mb-0">
                    <h4 className="font-medium text-slate-900 line-clamp-1">{req.courseNames}</h4>
                    <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{formatCourseDateRange(req.courseStartDate, req.courseEndDate, req.courseDates)}</span>
                      <span>•</span>
                      <span>
                        {req.status === "reimbursed"
                          ? `${formatCurrency(req.reimbursement?.amount ?? req.totalApproved ?? req.totalRequested)} reimbursed`
                          : formatCurrency(req.totalRequested)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={req.status} />
                    <Link href={`/requests/${req.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BODashboard() {
  const { data, isLoading } = useGetBoDashboard();

  if (isLoading || !data) return <DashboardSkeleton />;

  const { pendingApproval, totalFundingApproved, totalPendingAmount } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm font-medium mb-1">Total Funding Approved YTD</span>
              <span className="text-3xl font-bold text-slate-900">{formatCurrency(totalFundingApproved)}</span>
            </div>
          </CardContent>
        </Card>
        
        <Link href="/approvals" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full border-amber-200 bg-amber-50/70 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50">
            <CardContent className="p-6">
              <div className="flex flex-col">
                <span className="text-amber-800 text-sm font-medium mb-1 flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Pending CE Approvals
                </span>
                <span className="text-3xl font-bold text-amber-900">{formatCurrency(totalPendingAmount || 0)}</span>
                <span className="text-amber-700/80 text-xs mt-1">Across {pendingApproval.length} requests</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function AccountingDashboard() {
  const { data, isLoading } = useGetAccountingDashboard();

  if (isLoading || !data) return <DashboardSkeleton />;

  const { pendingReimbursement, totalPendingAmount } = data;

  return (
    <div className="space-y-6">
      <Link href="/reimbursements" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Card className="border-amber-200 bg-amber-50/70 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50">
          <CardContent className="p-6">
            <div className="flex flex-col">
              <span className="text-amber-800 text-sm font-medium mb-1 flex items-center gap-1">
                <Clock className="h-4 w-4" /> Pending Reimbursement Processing
              </span>
              <span className="text-3xl font-bold text-amber-900">{formatCurrency(totalPendingAmount)}</span>
              <span className="text-amber-700/80 text-xs mt-1">Across {pendingReimbursement.length} approved requests with receipts</span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function AdminDashboard() {
  const { data, isLoading } = useGetAdminDashboard();

  if (isLoading || !data) return <DashboardSkeleton />;

  const { totalUsers, usersByRole, pendingRoleAssignment } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(usersByRole).map(([role, count]) => (
          <Link key={role} href={`/users?role=${role}`} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full border-slate-200 shadow-sm transition-colors hover:border-primary/40 hover:bg-slate-50">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-slate-900">{count}</div>
                <div className="text-xs text-slate-500">
                  <span className="capitalize">{role.replace("_", " ")}</span>{role === "employee" || role === "manager" ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {pendingRoleAssignment && pendingRoleAssignment.length > 0 && (
        <Card className="shadow-sm border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-lg font-serif text-amber-900">Needs Role Assignment</CardTitle>
            <CardDescription className="text-amber-700">These users recently signed up and need roles assigned.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingRoleAssignment.map(user => (
                <div key={user.id} className="flex items-center justify-between p-3 bg-white rounded border border-amber-100">
                  <div>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </div>
                  <Link href={`/users/${user.id}`}>
                    <Button size="sm" variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-100">Assign Role</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-48 col-span-1 md:col-span-2 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
