import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, useParams } from "wouter";
import { useGetUser, useUpdateUser, useListClinics, useListUsers, useGetMe, getGetUserQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { ROLE_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.enum(["employee", "manager", "business_office", "accounting", "admin"]),
  clinicId: z.coerce.number().optional().nullable(),
  managerId: z.coerce.number().optional().nullable(),
  hireDate: z.string().optional().nullable(),
  conEdAllocation: z.coerce.number().positive().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function UserDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const isSelf = me?.id === id;

  const { data: user, isLoading: isUserLoading } = useGetUser(id, {
    query: { enabled: !!id && !isNaN(id), queryKey: getGetUserQueryKey(id) }
  });

  const { data: clinics } = useListClinics();
  const { data: potentialManagers } = useListUsers({ role: "manager" });

  const updateUser = useUpdateUser();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await customFetch(`/api/users/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted", description: `${user?.name} has been removed.` });
      setLocation("/users");
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err.message || "Failed to delete user",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      role: "employee",
      clinicId: null,
      managerId: null,
      hireDate: null,
      conEdAllocation: null,
    },
  });

  // Init form
  const initRef = useRef<number | null>(null);
  useEffect(() => {
    if (user && initRef.current !== id) {
      initRef.current = id;
      form.reset({
        name: user.name,
        role: user.role as any,
        clinicId: user.clinicId,
        managerId: user.managerId,
        hireDate: user.hireDate ? user.hireDate.substring(0, 10) : null,
        conEdAllocation: user.conEdAllocation ?? null,
      });
    }
  }, [user, id, form]);

  const onSubmit = (data: FormValues) => {
    const payload: any = { name: data.name };
    if (isAdmin) {
      payload.role = data.role;
      payload.clinicId = data.clinicId || null;
      payload.managerId = data.managerId || null;
      payload.hireDate = data.hireDate || null;
      payload.conEdAllocation = data.conEdAllocation ?? null;
    }
    updateUser.mutate(
      {
        userId: id,
        data: payload,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: ["/api/users"] });
          toast({
            title: "User updated",
            description: "The user profile has been successfully updated.",
          });
          setLocation("/users");
        },
        onError: (error: any) => {
          toast({
            title: "Update failed",
            description: error.message || "Failed to update user",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isUserLoading || !user) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Link href="/users">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">Edit User</h1>
          <p className="text-slate-500 mt-1">{user.name} ({user.email})</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="font-serif">User Configuration</CardTitle>
              <CardDescription>
                {isAdmin ? "Update role, clinic assignment, and manager" : "Update your profile name"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isAdmin && (
                <>
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>System Role</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="user-role-select">
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(ROLE_LABELS).map(([val, label]) => (
                              <SelectItem key={val} value={val}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Determines access level within the portal</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clinicId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinic Assignment</FormLabel>
                        <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a clinic" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-72 overflow-y-auto">
                            <SelectItem value="none">No Clinic</SelectItem>
                            {clinics?.map((c) => (
                              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="managerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Direct Manager</FormLabel>
                        <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a manager" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No Manager</SelectItem>
                            {potentialManagers?.map((m) => (
                              <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Required for employees to submit requests</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="hireDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hire Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription>Used to calculate prorated annual CEU allocations</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="conEdAllocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual Con-Ed Allocation</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="pl-7"
                              placeholder="Leave blank to use default"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>Override the calculated allocation. Leave blank to use the default (hire-date prorated $2,000/yr).</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4">
            <div>
              {isAdmin && !isSelf && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={isDeleting}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {isDeleting ? "Deleting..." : "Delete User"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the user account for <strong>{user.email}</strong>.
                        This action cannot be undone. Users with existing CE requests cannot be deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete User
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="flex gap-4">
              <Link href="/users">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={updateUser.isPending} className="min-w-[150px]">
                {updateUser.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
