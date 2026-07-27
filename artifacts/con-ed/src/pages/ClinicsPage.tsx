import {
  useListClinics,
  useGetMe,
  useCreateClinic,
  useDeleteClinic,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Clinic name is required")
    .max(120, "Clinic name is too long"),
});

type FormValues = z.infer<typeof formSchema>;

export default function ClinicsPage() {
  const { data: me } = useGetMe();
  const { data: clinics, isLoading } = useListClinics();
  const isAdmin = me?.role === "admin";

  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createClinic = useCreateClinic();
  const deleteClinic = useDeleteClinic();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = (values: FormValues) => {
    createClinic.mutate(
      { data: { name: values.name.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/clinics"] });
          toast({
            title: "Clinic added",
            description: `"${values.name.trim()}" was added to the clinic list.`,
          });
          form.reset();
          setOpen(false);
        },
        onError: (error) => {
          const description =
            error?.status === 409
              ? "A clinic with this name already exists."
              : error?.data?.error ?? "Could not add the clinic. Please try again.";
          toast({
            title: "Failed to add clinic",
            description,
            variant: "destructive",
          });
        },
      }
    );
  };

  const onDelete = (clinic: { id: number; name: string }) => {
    deleteClinic.mutate(
      { id: clinic.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/clinics"] });
          toast({
            title: "Clinic deleted",
            description: `"${clinic.name}" was removed from the clinic list.`,
          });
        },
        onError: (error) => {
          const description =
            error?.status === 409
              ? "This clinic still has employees assigned to it. Reassign those employees first."
              : error?.data?.error ?? "Could not delete the clinic. Please try again.";
          toast({
            title: "Failed to delete clinic",
            description,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Clinics"
        description="Olympic Sports & Spine clinic locations and assignments."
        actions={
          isAdmin ? (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) form.reset();
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add clinic
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">Add clinic</DialogTitle>
                <DialogDescription>
                  Add a new clinic location to the list. Names must be unique.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinic name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Olympia Downtown"
                            autoFocus
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpen(false)}
                      disabled={createClinic.isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createClinic.isPending}>
                      {createClinic.isPending ? "Adding…" : "Add clinic"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          ) : null
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Clinic</TableHead>
              {isAdmin && <TableHead className="w-24 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-8 ml-auto" />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : !clinics || clinics.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 2 : 1}
                  className="h-32 text-center text-slate-500"
                >
                  <div className="flex flex-col items-center justify-center">
                    <Building2 className="h-10 w-10 text-slate-300 mb-2" />
                    <p>No clinics found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              clinics.map((clinic) => {
                const isDeleting =
                  deleteClinic.isPending && deleteClinic.variables?.id === clinic.id;
                return (
                  <TableRow key={clinic.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        {clinic.name}
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                              disabled={isDeleting}
                              aria-label={`Delete ${clinic.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {clinic.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. A clinic that still has
                                employees assigned to it cannot be deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(clinic)}
                                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                              >
                                Delete Clinic
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
