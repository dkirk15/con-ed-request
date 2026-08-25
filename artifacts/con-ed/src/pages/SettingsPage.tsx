import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/PageHeader";

const formSchema = z.object({
  annualBudget: z
    .string()
    .min(1, "Annual budget is required")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0.01, {
      message: "Must be a positive dollar amount",
    })
    .refine((val) => parseFloat(val) <= 100_000, {
      message: "Must be at most $100,000",
    }),
});

type FormValues = z.infer<typeof formSchema>;

export default function SettingsPage() {
  const { data: me } = useGetMe();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { annualBudget: "" },
  });

  // Populate form once settings load
  useEffect(() => {
    if (settings) {
      form.reset({ annualBudget: String(settings.annualBudget) });
    }
  }, [settings, form]);

  if (me && me.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  function onSubmit(values: FormValues) {
    updateSettings.mutate(
      { data: { annualBudget: parseFloat(values.annualBudget) } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetSettingsQueryKey(), updated);
          form.reset({ annualBudget: String(updated.annualBudget) });
          toast({ title: "Settings saved", description: "Annual allocation updated successfully." });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save settings. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portal Settings"
        description="Configure global defaults for the CE reimbursement portal."
      />

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Annual Allocation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The default CE reimbursement budget per employee per year. Employees with a manual
            allocation override on their profile are unaffected.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-9 w-24" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="annualBudget"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Annual budget per employee</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                          $
                        </span>
                        <Input
                          {...field}
                          type="number"
                          min={0.01}
                          max={100000}
                          step={0.01}
                          className="pl-7"
                          placeholder="2000"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>Dollar amount, e.g. 2000</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateSettings.isPending || !form.formState.isDirty}>
                {updateSettings.isPending ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
