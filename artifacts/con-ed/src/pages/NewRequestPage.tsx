import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useCreateRequest } from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calculator } from "lucide-react";
import { Link } from "wouter";

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
});

type FormValues = z.infer<typeof formSchema>;

export default function NewRequestPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createRequest = useCreateRequest();

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
    },
  });

  const values = form.watch();
  
  const calculateTotal = () => {
    const sum = 
      (Number(values.tuition) || 0) +
      (Number(values.lodging) || 0) +
      (Number(values.airfare) || 0) +
      (Number(values.rentalCar) || 0) +
      (Number(values.parking) || 0);
    return sum;
  };

  const totalRequested = calculateTotal();

  const onSubmit = (data: FormValues) => {
    createRequest.mutate(
      {
        data: {
          ...data,
          totalRequested,
        },
      },
      {
        onSuccess: (response) => {
          queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
          queryClient.invalidateQueries({ queryKey: ["/api/users/me/dashboard"] }); // Approximate, depending on actual keys
          toast({
            title: "Request submitted",
            description: "Your continuing education request has been submitted for approval.",
          });
          setLocation(`/requests/${response.id}`);
        },
        onError: (error: any) => {
          toast({
            title: "Submission failed",
            description: error.message || "Failed to submit request",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Link href="/requests">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">New Request</h1>
          <p className="text-slate-500 mt-1">Submit a new continuing education funding request</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="font-serif">Course Details</CardTitle>
              <CardDescription>Information about the continuing education course or event</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="courseNames"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Course Name(s)</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g. Advanced Orthopedic Manual Therapy" {...field} />
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
                      <Input placeholder="E.g. Oct 12-14, 2024" {...field} />
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
                      <Input placeholder="E.g. Seattle, WA or Online" {...field} />
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
                      <Input type="number" step="0.5" placeholder="0" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Number of continuing education units</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="font-serif">Estimated Costs</CardTitle>
              <CardDescription>Breakdown of requested funding amounts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <FormField
                  control={form.control}
                  name="tuition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tuition / Registration</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                          <Input type="number" step="0.01" className="pl-7" {...field} value={field.value || ""} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lodging"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lodging</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                          <Input type="number" step="0.01" className="pl-7" {...field} value={field.value || ""} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="airfare"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Airfare</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                          <Input type="number" step="0.01" className="pl-7" {...field} value={field.value || ""} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rentalCar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rental Car</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                          <Input type="number" step="0.01" className="pl-7" {...field} value={field.value || ""} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="parking"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parking / Tolls</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                          <Input type="number" step="0.01" className="pl-7" {...field} value={field.value || ""} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                <div className="flex items-center text-slate-700 font-medium">
                  <Calculator className="h-5 w-5 mr-2 text-slate-400" />
                  Total Requested Funding
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  ${totalRequested.toFixed(2)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href="/requests">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createRequest.isPending} className="min-w-[150px]">
              {createRequest.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
