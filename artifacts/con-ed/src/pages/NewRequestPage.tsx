import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation, useParams } from "wouter";
import {
  getGetRequestQueryKey,
  useCreateRequest,
  useDeleteRequest,
  useGetRequest,
  useSubmitRequest,
  useUpdateRequest,
  customFetch,
} from "@workspace/api-client-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  DollarSign,
  FilePenLine,
  PenTool,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/constants";

const formSchema = z.object({
  courseNames: z.string().trim().min(1, "Enter the course or event name"),
  courseProvider: z.string().optional(),
  courseUrl: z.string().trim().url("Enter a complete URL, including https://").or(z.literal("")),
  courseStartDate: z.string().optional(),
  courseEndDate: z.string().optional(),
  deliveryMethod: z.enum(["in_person", "virtual", "hybrid"]).optional(),
  ceuCount: z.coerce.number().min(0, "CEUs cannot be negative").optional(),
  location: z.string().optional(),
  tuition: z.coerce.number().min(0, "Cost cannot be negative").optional(),
  lodging: z.coerce.number().min(0, "Cost cannot be negative").optional(),
  airfare: z.coerce.number().min(0, "Cost cannot be negative").optional(),
  rentalCar: z.coerce.number().min(0, "Cost cannot be negative").optional(),
  parking: z.coerce.number().min(0, "Cost cannot be negative").optional(),
  otherCosts: z.coerce.number().min(0, "Cost cannot be negative").optional(),
});

const submissionSchema = formSchema.superRefine((data, context) => {
  const requiredFields = [
    ["courseProvider", data.courseProvider, "Enter the course provider"],
    ["courseStartDate", data.courseStartDate, "Select the course start date"],
    ["courseEndDate", data.courseEndDate, "Select the course end date"],
    ["deliveryMethod", data.deliveryMethod, "Select how the course is delivered"],
  ] as const;

  requiredFields.forEach(([field, value, message]) => {
    if (!value?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  });

  if (data.courseStartDate && data.courseEndDate && data.courseEndDate < data.courseStartDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["courseEndDate"],
      message: "End date cannot be before the start date",
    });
  }

  if ((data.deliveryMethod === "in_person" || data.deliveryMethod === "hybrid") && !data.location?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["location"],
      message: "Enter the course location",
    });
  }
});

type FormValues = z.infer<typeof formSchema>;
type Action = "save" | "submit" | null;

interface BalanceData {
  annualAllocation: number;
  usedAmount: number;
  pendingAmount: number;
  remainingAmount: number;
  availableAllocation?: number;
  carryoverDebt?: number;
  year: number;
}

const DEFAULT_VALUES: FormValues = {
  courseNames: "",
  courseProvider: "",
  courseUrl: "",
  courseStartDate: "",
  courseEndDate: "",
  deliveryMethod: undefined,
  ceuCount: undefined,
  location: "",
  tuition: undefined,
  lodging: undefined,
  airfare: undefined,
  rentalCar: undefined,
  parking: undefined,
  otherCosts: undefined,
};

const COST_FIELDS = [
  ["tuition", "Tuition / registration"],
  ["lodging", "Lodging"],
  ["airfare", "Airfare"],
  ["rentalCar", "Rental car"],
  ["parking", "Parking / tolls"],
  ["otherCosts", "Other costs"],
] as const;

function requestToFormValues(request: {
  courseNames: string;
  courseProvider?: string | null;
  courseUrl?: string | null;
  courseStartDate?: string | null;
  courseEndDate?: string | null;
  deliveryMethod?: "in_person" | "virtual" | "hybrid" | null;
  ceuCount?: number | null;
  location?: string | null;
  tuition?: number | null;
  lodging?: number | null;
  airfare?: number | null;
  rentalCar?: number | null;
  parking?: number | null;
  otherCosts?: number | null;
}): FormValues {
  return {
    courseNames: request.courseNames,
    courseProvider: request.courseProvider ?? "",
    courseUrl: request.courseUrl ?? "",
    courseStartDate: request.courseStartDate ?? "",
    courseEndDate: request.courseEndDate ?? "",
    deliveryMethod: request.deliveryMethod ?? undefined,
    ceuCount: request.ceuCount || undefined,
    location: request.location ?? "",
    tuition: request.tuition || undefined,
    lodging: request.lodging || undefined,
    airfare: request.airfare || undefined,
    rentalCar: request.rentalCar || undefined,
    parking: request.parking || undefined,
    otherCosts: request.otherCosts || undefined,
  };
}

function useUnsavedChanges(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const message = "You have unsaved changes. Leave this request without saving?";
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    const handleLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [enabled]);
}

function RequestFormSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <Skeleton className="h-16 w-96 max-w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-[430px] w-full" />
      </div>
    </div>
  );
}

export default function NewRequestPage() {
  const params = useParams<{ id?: string }>();
  const parsedRequestId = Number(params.id);
  const requestId = Number.isInteger(parsedRequestId) && parsedRequestId > 0 ? parsedRequestId : null;
  const isEditing = requestId !== null;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createRequest = useCreateRequest();
  const updateRequest = useUpdateRequest();
  const submitRequest = useSubmitRequest();
  const deleteRequest = useDeleteRequest();
  const [activeDraftId, setActiveDraftId] = useState<number | null>(requestId);
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const hydratedRequestId = useRef<number | null>(null);
  const [today] = useState(() => new Date().toISOString().split("T")[0]);
  const [guaranteeName, setGuaranteeName] = useState("");
  const [guaranteeDate, setGuaranteeDate] = useState(today);
  const [guaranteeAcknowledged, setGuaranteeAcknowledged] = useState(false);

  const requestQuery = useGetRequest(requestId ?? 0, {
    query: {
      enabled: isEditing,
      queryKey: getGetRequestQueryKey(requestId ?? 0),
    },
  });

  const balanceQuery = useQuery<BalanceData>({
    queryKey: ["/api/dashboard/employee/balance"],
    queryFn: () =>
      customFetch<{ balance: BalanceData }>("/api/dashboard/employee").then(
        (data) => data.balance,
      ),
  });
  const balanceData = balanceQuery.data;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    const request = requestQuery.data;
    if (!request || hydratedRequestId.current === request.id) return;
    form.reset(requestToFormValues(request));
    setActiveDraftId(request.id);
    hydratedRequestId.current = request.id;
  }, [form, requestQuery.data]);

  const values = form.watch();
  const totalRequested = useMemo(
    () =>
      COST_FIELDS.reduce(
        (total, [name]) => total + (Number(values[name]) || 0),
        0,
      ),
    [values],
  );
  const remainingBudget = balanceData?.remainingAmount ?? null;
  const projectedRemaining = remainingBudget === null ? null : remainingBudget - totalRequested;
  const futureDebt = Math.max(0, -(projectedRemaining ?? 0));
  const isOverBudget = projectedRemaining !== null && projectedRemaining < 0;
  const availableAllocation = balanceData?.availableAllocation ?? balanceData?.annualAllocation ?? 0;
  const fundingUsedAfterRequest = (balanceData?.usedAmount ?? 0) + (balanceData?.pendingAmount ?? 0) + totalRequested;
  const fundingPercent = availableAllocation > 0
    ? Math.min(100, Math.round((fundingUsedAfterRequest / availableAllocation) * 100))
    : totalRequested > 0 ? 100 : 0;
  const guaranteeChanged = guaranteeName.trim() !== "" || guaranteeAcknowledged || guaranteeDate !== today;
  const hasUnsavedChanges = form.formState.isDirty || guaranteeChanged;
  const isBusy = createRequest.isPending || updateRequest.isPending || submitRequest.isPending || deleteRequest.isPending;

  useUnsavedChanges(hasUnsavedChanges);

  const requestPayload = (data: FormValues) => ({
    ...data,
    courseNames: data.courseNames.trim(),
    courseProvider: data.courseProvider?.trim() || null,
    courseUrl: data.courseUrl?.trim() || null,
    courseStartDate: data.courseStartDate || null,
    courseEndDate: data.courseEndDate || null,
    deliveryMethod: data.deliveryMethod ?? null,
    location: data.location?.trim() || null,
    totalRequested,
  });

  const persistDraft = async (data: FormValues) => {
    const payload = requestPayload(data);
    if (activeDraftId) {
      return updateRequest.mutateAsync({ requestId: activeDraftId, data: payload });
    }
    const created = await createRequest.mutateAsync({ data: payload });
    setActiveDraftId(created.id);
    return created;
  };

  const invalidateRequestData = (id?: number) => {
    queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/employee/balance"] });
    if (id) queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(id) });
  };

  const saveDraft = async (data: FormValues) => {
    setActiveAction("save");
    try {
      const saved = await persistDraft(data);
      form.reset(requestToFormValues(saved));
      setLastSavedAt(new Date());
      invalidateRequestData(saved.id);
      toast({
        title: "Draft saved",
        description: "You can return to My Requests and continue this request later.",
      });
      if (!isEditing) {
        setLocation(`/requests/${saved.id}/edit`, { replace: true });
      }
    } catch (error: unknown) {
      toast({
        title: "Draft was not saved",
        description: error instanceof Error ? error.message : "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setActiveAction(null);
    }
  };

  const submitForApproval = async (data: FormValues) => {
    const submissionResult = submissionSchema.safeParse(data);
    if (!submissionResult.success) {
      const firstIssue = submissionResult.error.issues[0];
      submissionResult.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof FormValues;
        form.setError(field, { type: "manual", message: issue.message });
      });
      if (firstIssue?.path[0]) form.setFocus(firstIssue.path[0] as keyof FormValues);
      toast({
        title: "Complete the course details",
        description: "Add the required course information before sending this request for approval.",
        variant: "destructive",
      });
      return;
    }

    if (isOverBudget && (!guaranteeName.trim() || !guaranteeDate || !guaranteeAcknowledged)) {
      toast({
        title: "Complete the repayment guarantee",
        description: "A signed repayment guarantee is required because this request exceeds your available CE balance.",
        variant: "destructive",
      });
      return;
    }

    setActiveAction("submit");
    let savedId = activeDraftId;
    try {
      const saved = await persistDraft(data);
      savedId = saved.id;
      await submitRequest.mutateAsync({
        requestId: saved.id,
        data: isOverBudget
          ? {
              guaranteeSignedName: guaranteeName.trim(),
              guaranteeSignedDate: guaranteeDate,
              guaranteeAcknowledged: true,
            }
          : {},
      });
      invalidateRequestData(saved.id);
      toast({
        title: "Request submitted",
        description: "Your request is now waiting for manager approval. Do not purchase until final approval.",
      });
      setLocation(`/requests/${saved.id}`);
    } catch (error: unknown) {
      toast({
        title: "Request was saved but not submitted",
        description: error instanceof Error ? error.message : "Open the draft and try submitting again.",
        variant: "destructive",
      });
      if (!isEditing && savedId) {
        setLocation(`/requests/${savedId}/edit`, { replace: true });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const leaveForm = () => {
    if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave this request without saving?")) {
      return;
    }
    setLocation("/requests");
  };

  const removeDraft = async () => {
    if (!activeDraftId) return;
    try {
      await deleteRequest.mutateAsync({ requestId: activeDraftId });
      invalidateRequestData();
      toast({ title: "Draft deleted", description: "The draft has been permanently removed." });
      setLocation("/requests?status=draft");
    } catch (error: unknown) {
      toast({
        title: "Draft was not deleted",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  if (isEditing && requestQuery.isLoading) return <RequestFormSkeleton />;

  if (isEditing && (requestQuery.isError || !requestQuery.data)) {
    return (
      <Card className="mx-auto max-w-xl border-slate-200">
        <CardHeader>
          <CardTitle>Draft could not be opened</CardTitle>
          <CardDescription>
            {requestQuery.error instanceof Error ? requestQuery.error.message : "The request may no longer exist."}
          </CardDescription>
        </CardHeader>
        <CardContent><Button asChild><Link href="/requests">Return to requests</Link></Button></CardContent>
      </Card>
    );
  }

  if (requestQuery.data && requestQuery.data.status !== "draft") {
    return (
      <Card className="mx-auto max-w-xl border-slate-200">
        <CardHeader>
          <CardTitle>This request has already been submitted</CardTitle>
          <CardDescription>Submitted requests cannot be edited. Open the request to review its current status.</CardDescription>
        </CardHeader>
        <CardContent><Button asChild><Link href={`/requests/${requestQuery.data.id}`}>View request</Link></Button></CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex items-start gap-4">
        <Button variant="outline" size="icon" className="mt-1 h-9 w-9 shrink-0" onClick={leaveForm} aria-label="Back to requests">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Request planning</p>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
              {activeDraftId ? `Draft #${activeDraftId}` : "Not saved"}
            </span>
          </div>
          <h1 className="mt-1 text-3xl font-serif font-bold text-slate-950">
            {isEditing ? "Continue your CE request" : "New CE request"}
          </h1>
          <p className="mt-1 text-slate-500">Plan the course and estimated costs before sending it for approval.</p>
        </div>
      </header>

      <Alert className="border-amber-300 bg-amber-50 text-amber-950">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Get approval before making a purchase</AlertTitle>
        <AlertDescription>
          Wait for both manager and Business Office approval before registering, paying, or booking travel. Receipt upload becomes available after final approval.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={(event) => event.preventDefault()} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary"><BookOpen className="h-5 w-5" aria-hidden="true" /></div>
                  <div>
                    <CardTitle className="font-serif">Course details</CardTitle>
                    <CardDescription>Tell reviewers what you plan to attend.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="courseNames"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Course or event name <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input placeholder="Advanced Orthopedic Manual Therapy" autoComplete="off" autoFocus {...field} /></FormControl>
                      <FormDescription>This is the only field required to save a draft.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="courseProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course provider <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input placeholder="Institute of Physical Art" autoComplete="organization" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="courseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course webpage</FormLabel>
                      <FormControl><Input type="url" placeholder="https://provider.org/course" autoComplete="url" {...field} /></FormControl>
                      <FormDescription>Optional link reviewers can use to verify course details.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="courseStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start date <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="date" autoComplete="off" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="courseEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End date <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="date" min={values.courseStartDate || undefined} autoComplete="off" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliveryMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery method <span className="text-destructive">*</span></FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          if (value !== "in_person" && value !== "virtual" && value !== "hybrid") return;
                          field.onChange(value);
                          if (value === "virtual") {
                            form.setValue("location", "", { shouldDirty: true, shouldValidate: true });
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select delivery method" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="in_person">In person</SelectItem>
                          <SelectItem value="virtual">Virtual</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <FormControl><Input type="number" min="0" step="0.5" placeholder="0" autoComplete="off" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(values.deliveryMethod === "in_person" || values.deliveryMethod === "hybrid") && (
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Course location <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input placeholder="Seattle, WA" autoComplete="off" {...field} /></FormControl>
                        <FormDescription>Enter the venue, city, or both.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary"><DollarSign className="h-5 w-5" aria-hidden="true" /></div>
                  <div>
                    <CardTitle className="font-serif">Estimated costs</CardTitle>
                    <CardDescription>Enter the amount you expect OSS to fund in each category.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 pt-6 sm:grid-cols-2">
                {COST_FIELDS.map(([name, label]) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label} ($)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" inputMode="decimal" autoComplete="off" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </CardContent>
            </Card>

            {isOverBudget && (
              <Card className="border-amber-300 bg-amber-50/60 shadow-sm">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-amber-100 p-2 text-amber-800"><PenTool className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                      <CardTitle className="font-serif text-amber-950">OSS repayment guarantee</CardTitle>
                      <CardDescription className="mt-2 leading-relaxed text-amber-900">
                        Olympic Sports &amp; Spine (OSS) has advanced to me continuing education funding upon my request. To reimburse OSS for this advance, I agree to designate continuing education benefits that will be accrued through my future work hours in the amount necessary to satisfy this debt. In the event that my employment with OSS is terminated, either voluntarily or involuntarily, I agree to repay OSS for any advanced continuing education balance that remains unsatisfied after all future benefit accruals are applied.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start gap-3">
                    <Checkbox id="guarantee-acknowledgment" checked={guaranteeAcknowledged} onCheckedChange={(checked) => setGuaranteeAcknowledged(checked === true)} className="mt-0.5" />
                    <label htmlFor="guarantee-acknowledgment" className="cursor-pointer text-sm leading-6 text-amber-950">
                      I agree to conduct business electronically and understand that typing my name below acts as my legally binding signature to the full terms of this OSS Repayment Policy.
                    </label>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="guarantee-name" className="text-sm font-medium text-amber-950">Full legal name <span className="text-destructive">*</span></label>
                      <Input id="guarantee-name" value={guaranteeName} onChange={(event) => setGuaranteeName(event.target.value)} placeholder="Type your full name to sign" autoComplete="name" className="border-amber-300 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="guarantee-date" className="text-sm font-medium text-amber-950">Date <span className="text-destructive">*</span></label>
                      <Input id="guarantee-date" type="date" value={guaranteeDate} onChange={(event) => setGuaranteeDate(event.target.value)} autoComplete="off" className="border-amber-300 bg-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <FilePenLine className="h-5 w-5 text-primary" aria-hidden="true" />
                  Funding impact
                </CardTitle>
                <CardDescription>Estimated against your current CE balance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-sm text-slate-500">Request total</span>
                    <span className="text-2xl font-bold tabular-nums text-slate-950">{formatCurrency(totalRequested)}</span>
                  </div>
                  <Progress value={fundingPercent} className={`mt-3 ${isOverBudget ? "[&>div]:bg-amber-600" : ""}`} aria-label={`${fundingPercent}% of available funding committed after this request`} />
                </div>
                <Separator />
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Available now</dt><dd className="font-medium tabular-nums">{remainingBudget === null ? balanceQuery.isError ? "Unavailable" : "Loading" : formatCurrency(remainingBudget)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Used</dt><dd className="font-medium tabular-nums">{formatCurrency(balanceData?.usedAmount ?? 0)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Pending</dt><dd className="font-medium tabular-nums">{formatCurrency(balanceData?.pendingAmount ?? 0)}</dd></div>
                  {Boolean(balanceData?.carryoverDebt) && (
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Existing future debt</dt><dd className="font-medium tabular-nums text-amber-800">{formatCurrency(balanceData?.carryoverDebt ?? 0)}</dd></div>
                  )}
                </dl>
                {balanceQuery.isError && (
                  <p className="text-xs leading-5 text-destructive">Your balance could not be loaded. Save this draft and try submitting again.</p>
                )}
                <div className={`rounded-md border p-3 ${isOverBudget ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <div className="flex items-start gap-2">
                    {isOverBudget ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />}
                    <div>
                      <p className={`text-sm font-semibold ${isOverBudget ? "text-amber-950" : "text-emerald-950"}`}>
                        {isOverBudget ? `${formatCurrency(futureDebt)} future CE debt` : `${formatCurrency(Math.max(0, projectedRemaining ?? 0))} projected remaining`}
                      </p>
                      <p className={`mt-1 text-xs leading-5 ${isOverBudget ? "text-amber-800" : "text-emerald-800"}`}>
                        {isOverBudget ? "A repayment guarantee is required before submission." : "This request is within your currently available balance."}
                      </p>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Button type="button" className="w-full" disabled={isBusy || !balanceData || (isOverBudget && (!guaranteeName.trim() || !guaranteeDate || !guaranteeAcknowledged))} onClick={form.handleSubmit(submitForApproval)}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {activeAction === "submit" ? "Submitting" : "Submit for approval"}
                  </Button>
                  <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={form.handleSubmit(saveDraft)}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {activeAction === "save" ? "Saving" : "Save draft"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full text-slate-600" disabled={isBusy} onClick={leaveForm}>Cancel</Button>
                </div>
                <div className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{lastSavedAt ? `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : activeDraftId ? "Changes are not saved automatically." : "Save a draft to continue later."}</span>
                </div>
              </CardContent>
            </Card>

            {activeDraftId && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive" disabled={isBusy}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete draft
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently removes the request. This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep draft</AlertDialogCancel>
                    <AlertDialogAction onClick={removeDraft} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete draft</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </aside>
        </form>
      </Form>
    </div>
  );
}
