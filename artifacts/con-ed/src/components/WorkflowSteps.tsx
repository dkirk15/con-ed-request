import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "request", label: "Request" },
  { id: "manager", label: "Manager" },
  { id: "business_office", label: "Business Office" },
  { id: "purchase", label: "Purchase & receipt" },
  { id: "reimbursement", label: "Reimbursement" },
] as const;

type WorkflowStep = (typeof STEPS)[number]["id"];

export function WorkflowSteps({ current, className }: { current: WorkflowStep | "complete"; className?: string }) {
  const currentIndex = current === "complete" ? STEPS.length : STEPS.findIndex((step) => step.id === current);

  return (
    <ol className={cn("grid grid-cols-5 overflow-hidden rounded-md border border-slate-200 bg-white", className)} aria-label="Request workflow">
      {STEPS.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.id}
            className={cn(
              "relative flex min-w-0 items-center gap-2 border-r border-slate-200 px-3 py-2.5 text-xs last:border-r-0",
              active && "bg-orange-50 text-orange-950",
              complete && "bg-emerald-50/60 text-emerald-900",
              !active && !complete && "text-slate-500",
            )}
            aria-current={active ? "step" : undefined}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                active && "border-primary bg-primary text-white",
                complete && "border-emerald-600 bg-emerald-600 text-white",
                !active && !complete && "border-slate-300 bg-white text-slate-500",
              )}
            >
              {complete ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
            </span>
            <span className="truncate font-medium">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
