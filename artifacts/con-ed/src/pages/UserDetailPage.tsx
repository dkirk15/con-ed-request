import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, useParams } from "wouter";
import { useGetUser, useUpdateUser, useListClinics, useListUsers, getGetUserQueryKey } from "@workspace/api-client-react";
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useRef } from "react";
import { ROLE_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
  role: z.enum(["employee", "manager", "business_office", "accounting", "admin"]),
  clinicId: z.coerce.number().optional().nullable(),
  managerId: z.coerce.number().optional().nullable(),
  hireDate: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function UserDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading: isUserLoading } = useGetUser(id, { 
    query: { enabled: !!id && !isNaN(id), queryKey: getGetUserQueryKey(id) } 
  });
  
  const { data: clinics } = useListClinics();
  const { data: potentialManagers } = useListUsers({ role: "manager" });
  
  const updateUser = useUpdateUser();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      role: "employee",
      clinicId: null,
      managerId: null,
      hireDate: null,
    },
  });

  // Init form
  const initRef = useRef<number | null>(null);
  useEffect(() => {
    if (user && initRef.current !== id) {
      initRef.current = id;
      form.reset({
        role: user.role as any,
        clinicId: user.clinicId,
        managerId: user.managerId,
        hireDate: user.hireDate ? user.hireDate.substring(0, 10) : null,
      });
    }
  }, [user, id, form]);

  const onSubmit = (data: FormValues) => {
    updateUser.mutate(
      {
        userId: id,
        data: {
          role: data.role,
          clinicId: data.clinicId || null,
          managerId: data.managerId || null,
          hireDate: data.hireDate || null,
        },
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
              <CardDescription>Update role, clinic assignment, and manager</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
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

            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href="/users">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" disabled={updateUser.isPending} className="min-w-[150px]">
              {updateUser.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
