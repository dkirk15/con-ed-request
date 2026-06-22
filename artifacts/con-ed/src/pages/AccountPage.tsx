import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/constants";
import { RoleBadge } from "@/components/RoleBadge";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountPage() {
  const { data: user, isLoading } = useGetMe();

  if (isLoading || !user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">My Account</h1>
        <p className="text-slate-500 mt-1">Manage your profile and settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-500">Name</div>
              <div className="text-lg font-medium">{user.name}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Email</div>
              <div>{user.email}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500 mb-1">Role</div>
              <RoleBadge role={user.role} />
            </div>
            {user.clinicName && (
              <div>
                <div className="text-sm font-medium text-slate-500">Clinic</div>
                <div>{user.clinicName}</div>
              </div>
            )}
            {user.managerName && (
              <div>
                <div className="text-sm font-medium text-slate-500">Manager</div>
                <div>{user.managerName}</div>
              </div>
            )}
            {user.hireDate && (
              <div>
                <div className="text-sm font-medium text-slate-500">Hire Date</div>
                <div>{formatDate(user.hireDate)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
