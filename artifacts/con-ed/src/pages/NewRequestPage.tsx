import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useCreateRequest, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calculator, AlertTriangle, PenTool } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/constants";

const formSchema = z.object({
  courseNames: z.string().min(1, "Course name is required"),
  courseDates: z.string().optional(),
  ceuCount: z.coerce.number().optional(),
  location: z.string().optional(),
  tuition: z.coerce.number().min(0).optional(),
  lodging: z.coerce.number().min(0).optional(),
  airfare: z.coerce.number().min(0).optional(),
  rentalCar: z.coerce.number().min(0).optional(),
  parking: z.coerce.number().min(0).optional(),
  otherCosts: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface BalanceData {
  annualAllocation: number;
  usedAmount: number;
  pendingAmount: number;
  remainingAmount: number;
  availableAllocation?: number;
  carryoverDebt?: number;
  year: number;
}

export default function NewRequestPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createRequest = useCreateRequest();

  const [guaranteeName, setGuaranteeName] = useState("");
  const [guaranteeDate, setGuaranteeDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [guaranteeAcknowledged, setGuaranteeAcknowledged] = useState(false);

  const { data: balanceData } = useQuery<BalanceData>({
    queryKey: ["/api/dashboard/employee/balance"],
    queryFn: () =>
      customFetch<{ balance: BalanceData }>("/api/dashboard/employee").then(
        (d) => d.balance,
      ),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      courseNames: "",
      courseDates: "",
      ceuCount: undefined,
      location: "",
      tuition: 0,
      lodging: 0,
      airfare: 0,
      rentalCar: 0,
      parking: 0,
      otherCosts: 0,
    },
  });

  const values = form.watch();

  const calculateTotal = () => {
    return (
      (Number(values.tuition) || 0) +
      (Number(values.lodging) || 0) +
      (Number(values.airfare) || 0) +
      (Number(values.rentalCar) || 0) +
      (Number(values.parking) || 0) +
      (Number(values.otherCosts) || 0)
    );
  };

  const totalRequested = calculateTotal();
  const remainingBudget = balanceData?.remainingAmount ?? null;
  const isOverBudget =
    remainingBudget !== null && totalRequested > remainingBudget;

  const onSubmit = async (data: FormValues) => {
    if (
      isOverBudget &&
      (!guaranteeName.trim() || !guaranteeDate.trim() || !guaranteeAcknowledged)
    ) {
      toast({
        title: "Repayment guarantee required",
        description:
          "This request exceeds your available budget. Please read the repayment policy, check the acknowledgment box, and enter your full name and today's date to sign.",
        variant: "destructive",
      });
      return;
    }

    createRequest.mutate(
      { data: { ...data, totalRequested } },
      {
        onSuccess: async (response) => {
          // Immediately submit the draft — passes guarantee data for over-budget requests
          try {
            await customFetch(`/api/requests/${response.id}/submit`, {
              method: "POST",
              body: JSON.stringify(
                isOverBudget
                  ? {
                      guaranteeSignedName: guaranteeName.trim(),
                      guaranteeSignedDate: guaranteeDate,
                      guaranteeAcknowledged: true,
                    }
                  : {},
              ),
            });
          } catch (err: unknown) {
            const msg =
              err instanceof Error ? err.message : "Failed to submit request";
            toast({
              title: "Submission failed",
              description: msg,
              variant: "destructive",
            });
            setLocation(`/requests/${response.id}`);
            return;
          }

          queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
          queryClient.invalidateQueries({
            queryKey: ["/api/dashboard/employee/balance"],
          });
          toast({
            title: "Request submitted",
            description:
              "Your continuing education request has been submitted for manager review.",
          });
          setLocation(`/requests/${response.id}`);
        },
        onError: (error: unknown) => {
          const msg =
            error instanceof Error ? error.message : "Failed to submit request";
          toast({
            title: "Submission failed",
            description: msg,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" className="h-8 w-8" asChild>
          <Link href="/requests" aria-label="Back to requests">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">
            New Request
          </h1>
          <p className="text-slate-500 mt-1">
            Submit a new continuing education funding request
          </p>
        </div>
      </div>

      {balanceData && (
        <div className="flex items-center gap-6 bg-slate-50 rounded-lg border border-slate-200 px-5 py-3 text-sm">
          <span className="text-slate-500">Available budget:</span>
          <span className="font-semibold">
            {formatCurrency(balanceData.availableAllocation ?? balanceData.annualAllocation)}
          </span>
          {balanceData.carryoverDebt ? (
            <>
              <span className="text-slate-500">Carry-forward debt:</span>
              <span className="font-semibold text-amber-700">
                {formatCurrency(balanceData.carryoverDebt)}
              </span>
            </>
          ) : null}
          <span className="text-slate-500">Used / Pending:</span>
          <span className="font-semibold">
            {formatCurrency(balanceData.usedAmount)} /{" "}
            {formatCurrency(balanceData.pendingAmount)}
          </span>
          <span className="text-slate-500">Remaining:</span>
          <span
            className={`font-semibold ${balanceData.remainingAmount < 0 ? "text-red-600" : "text-green-700"}`}
          >
            {formatCurrency(balanceData.remainingAmount)}
          </span>
        </div>
      )}

      <Alert className="border-amber-200 bg-amber-50 text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Wait for approval before purchasing</AlertTitle>
        <AlertDescription>
          Submit this request and wait for both manager and Business Office approval
          before registering, paying for the course, or booking travel. Receipt upload
          becomes available after final approval.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="font-serif">Course Details</CardTitle>
              <CardDescription>
                Information about the continuing education course or event
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="courseNames"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Course Name(s)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="E.g. Advanced Orthopedic Manual Therapy"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="courseDates"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Course Dates</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="E.g. Oct 12–14, 2025"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="E.g. Seattle, WA or Online"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ceuCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected CEUs</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="0"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Number of continuing education units
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="font-serif">Estimated Costs</CardTitle>
              <CardDescription>
                Breakdown of requested funding amounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {(
                  [
                    ["tuition", "Tuition / Registration"],
                    ["lodging", "Lodging"],
                    ["airfare", "Airfare"],
                    ["rentalCar", "Rental Car"],
                    ["parking", "Parking / Tolls"],
                    ["otherCosts", "Other Costs"],
                  ] as const
                ).map(([name, label]) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500">
                              $
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              className="pl-7"
                              {...field}
                              value={field.value || ""}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                <div className="flex items-center text-slate-700 font-medium">
                  <Calculator className="h-5 w-5 mr-2 text-slate-400" />
                  Total Requested Funding
                </div>
                <div
                  className={`text-2xl font-bold ${isOverBudget ? "text-red-600" : "text-slate-900"}`}
                >
                  {formatCurrency(totalRequested)}
                </div>
              </div>

              {isOverBudget && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Over budget by {formatCurrency(totalRequested - (remainingBudget ?? 0))}</AlertTitle>
                  <AlertDescription>
                    This request exceeds your remaining annual budget of{" "}
                    {formatCurrency(remainingBudget ?? 0)}. Per OSS policy, you
                    must review and sign the OSS Repayment Policy below before
                    submitting.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {isOverBudget && (
            <Card className="shadow-sm border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2 text-orange-900">
                  <PenTool className="h-5 w-5" />
                  OSS Repayment Policy
                </CardTitle>
                <CardDescription className="text-orange-800 leading-relaxed">
                  Olympic Sports &amp; Spine (OSS) has advanced to me continuing
                  education funding upon my request. To reimburse OSS for this
                  advance, I agree to designate continuing education benefits
                  that will be accrued through my future work hours in the amount
                  necessary to satisfy this debt. In the event that my
                  employment with OSS is terminated, either voluntarily or
                  involuntarily, I agree to repay OSS for any advanced continuing
                  education balance that remains unsatisfied after all future
                  benefit accruals are applied.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={guaranteeAcknowledged}
                    onCheckedChange={(checked) =>
                      setGuaranteeAcknowledged(checked === true)
                    }
                    className="mt-0.5 border-orange-400 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                  />
                  <span className="text-sm text-orange-900">
                    I agree to conduct business electronically and understand
                    that typing my name below acts as my legally binding
                    signature to the full terms of this OSS Repayment Policy.
                  </span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-orange-900">
                      Full Legal Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="Type your full name to sign"
                      value={guaranteeName}
                      onChange={(e) => setGuaranteeName(e.target.value)}
                      className="border-orange-300 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-orange-900">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="date"
                      value={guaranteeDate}
                      onChange={(e) => setGuaranteeDate(e.target.value)}
                      className="border-orange-300 bg-white"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-4">
            <Link href="/requests">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={
                createRequest.isPending ||
                (isOverBudget &&
                  (!guaranteeName.trim() ||
                    !guaranteeDate.trim() ||
                    !guaranteeAcknowledged))
              }
              className="min-w-[150px]"
            >
              {createRequest.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
