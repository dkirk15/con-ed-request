import { Link } from "wouter";
import {
  type TaskItem,
  useGetTaskCenter,
} from "@workspace/api-client-react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Eye,
  FilePenLine,
  RefreshCw,
  ReceiptText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCourseDateRange } from "@/lib/constants";

type Role = "employee" | "manager" | "business_office" | "accounting" | "admin";

const HEADINGS: Record<Role, { title: string; description: string }> = {
  employee: {
    title: "Your next steps",
    description: "Requests that need action or are moving through review.",
  },
  manager: {
    title: "Needs attention",
    description: "Clinic approvals and your own CE request next steps.",
  },
  business_office: {
    title: "Awaiting Business Office Approval",
    description: "Manager-approved requests ready for a CE funding decision.",
  },
  accounting: {
    title: "Ready for Reimbursement",
    description: "Approved requests with receipts ready for reimbursement.",
  },
  admin: {
    title: "Workflow watchlist",
    description: "The oldest active requests across the organization.",
  },
};

function taskAction(item: TaskItem, role: Role) {
  if (role === "admin") {
    return { href: `/requests/${item.requestId}`, label: "Open request", icon: Eye };
  }
  if (item.taskType === "draft_request") {
    return { href: `/requests/${item.requestId}/edit`, label: "Continue request", icon: FilePenLine };
  }
  if (item.taskType === "manager_approval" || item.taskType === "bo_approval") {
    if (item.kind === "action") {
      return { href: `/approvals?selected=${item.requestId}`, label: "Review", icon: ArrowRight };
    }
    return { href: `/requests/${item.requestId}`, label: "View status", icon: Eye };
  }
  if (item.taskType === "reimbursement" && item.kind === "action") {
    return {
      href: `/reimbursements?selected=${item.requestId}`,
      label: "Process",
      icon: ReceiptText,
    };
  }
  return {
    href: `/requests/${item.requestId}`,
    label: item.taskType === "approved_purchase" ? "Add receipt" : "View status",
    icon: item.taskType === "approved_purchase" ? ReceiptText : Eye,
  };
}

function taskDescription(item: TaskItem, role: Role): string {
  if (item.taskType === "draft_request") {
    return "Finish the course and cost details when you are ready.";
  }
  if (item.taskType === "manager_approval") {
    return role === "manager"
      ? "Review the request and send your decision to the Business Office."
      : role === "admin"
        ? "Waiting for clinic manager approval."
        : "Your manager is reviewing this request.";
  }
  if (item.taskType === "bo_approval") {
    return role === "business_office"
      ? "Confirm the eligible costs and make the final funding decision."
      : role === "admin"
        ? "Waiting for the Business Office funding decision."
        : "The Business Office is making the final funding decision.";
  }
  if (item.taskType === "approved_purchase") {
    return role === "admin"
      ? "Funding is approved and the employee has not submitted a receipt."
      : "Purchase is approved. Add the receipt after the course is purchased.";
  }
  if (item.taskType === "receipt_submitted") {
    return "Your receipt was received and is waiting for Accounting.";
  }
  return role === "admin"
    ? "A submitted receipt is waiting for reimbursement."
    : "Verify the payment amount and record the paycheck date.";
}

function ageLabel(item: TaskItem): string {
  if (item.taskType === "approved_purchase" && item.courseEndDate) {
    const courseEnd = new Date(`${item.courseEndDate}T23:59:59`);
    if (courseEnd >= new Date()) {
      return formatCourseDateRange(item.courseStartDate, item.courseEndDate);
    }
    return item.ageDays === 0
      ? "Course ended today"
      : `Course ended ${item.ageDays} ${item.ageDays === 1 ? "day" : "days"} ago`;
  }
  if (item.ageDays === 0) return "Updated today";
  if (item.taskType === "draft_request") {
    return `${item.ageDays} ${item.ageDays === 1 ? "day" : "days"} since update`;
  }
  return `${item.ageDays} ${item.ageDays === 1 ? "day" : "days"} waiting`;
}

function priorityLabel(item: TaskItem) {
  if (item.priority === "stale") return "Needs follow-up";
  if (item.priority === "aging") return "Aging";
  if (item.kind === "waiting") return "In progress";
  if (item.kind === "monitoring") return "Monitoring";
  return "Ready";
}

export default function TaskCenterPanel({ role }: { role: Role }) {
  const { data, isLoading, isError, refetch } = useGetTaskCenter();
  const heading = HEADINGS[role];

  if (isLoading) return <Skeleton className="h-56 w-full rounded-md" />;
  if (isError || !data) {
    return (
      <section className="rounded-md border border-slate-200 bg-white px-5 py-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-950">Next steps could not be loaded</h2>
            <p className="mt-1 text-sm text-slate-500">Check your connection and try again.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
      aria-labelledby="task-center-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="task-center-heading" className="font-serif text-lg font-bold text-slate-950">
              {heading.title}
            </h2>
            {data.actionCount > 0 ? (
              <Badge className="bg-primary text-primary-foreground">
                {data.actionCount} {data.actionCount === 1 ? "action" : "actions"}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">{heading.description}</p>
        </div>
        {data.staleCount > 0 ? (
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            {data.staleCount} {data.staleCount === 1 ? "item needs" : "items need"} follow-up
          </div>
        ) : data.agingCount > 0 ? (
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            {data.agingCount} {data.agingCount === 1 ? "item is" : "items are"} aging
          </div>
        ) : null}
      </div>

      {data.items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-7 text-sm text-slate-600">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="font-medium text-slate-900">Nothing needs attention</div>
            <div className="mt-0.5 text-slate-500">New work will appear here automatically.</div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {data.items.map((item) => {
            const action = taskAction(item, role);
            const ActionIcon = action.icon;
            const priorityClass = item.priority === "stale"
              ? "border-l-red-500 bg-red-50/40"
              : item.priority === "aging"
                ? "border-l-amber-500 bg-amber-50/40"
                : "border-l-transparent";
            return (
              <div
                key={`${item.requestId}-${item.taskType}`}
                className={`grid gap-3 border-l-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${priorityClass}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/requests/${item.requestId}`}
                      className="truncate font-medium text-slate-950 hover:text-primary hover:underline"
                    >
                      {item.courseName}
                    </Link>
                    <Badge
                      variant={item.priority === "stale" ? "destructive" : item.priority === "aging" ? "secondary" : "outline"}
                      className={item.priority === "aging" ? "border-amber-200 bg-amber-100 text-amber-900" : ""}
                    >
                      {priorityLabel(item)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{taskDescription(item, role)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {role !== "employee" ? (
                      <span>
                        {item.employeeName}{item.clinicName ? ` | ${item.clinicName}` : ""}
                      </span>
                    ) : null}
                    <span>{ageLabel(item)}</span>
                  </div>
                </div>
                <Button asChild variant={item.kind === "action" ? "default" : "outline"} size="sm">
                  <Link href={action.href}>
                    <ActionIcon className="h-4 w-4" aria-hidden="true" />
                    {action.label}
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
