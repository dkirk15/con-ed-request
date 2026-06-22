import { useState } from "react";
import { useGetMe, useUpdateUser, getGetMeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/constants";
import { RoleBadge } from "@/components/RoleBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Pencil } from "lucide-react";

export default function AccountPage() {
  const { data: user, isLoading } = useGetMe();
  const updateUser = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  if (isLoading || !user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const startEditing = () => {
    setNameValue(user.name);
    setEditingName(true);
  };

  const saveName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === user.name) {
      setEditingName(false);
      return;
    }
    updateUser.mutate(
      {
        userId: user.id,
        data: { name: trimmed },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Name updated", description: "Your profile name has been saved." });
          setEditingName(false);
        },
        onError: (err: any) => {
          toast({
            title: "Update failed",
            description: err.message || "Could not update your name.",
            variant: "destructive",
          });
        },
      }
    );
  };

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
              {editingName ? (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    autoFocus
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={saveName} disabled={updateUser.isPending}>
                    {updateUser.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <div className="text-lg font-medium">{user.name}</div>
                  <Button variant="ghost" size="sm" onClick={startEditing} className="h-8 w-8 p-0">
                    <Pencil className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              )}
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
