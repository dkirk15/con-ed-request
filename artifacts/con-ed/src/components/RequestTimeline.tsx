import type { ConEdRequest } from "@workspace/api-client-react";
import {
  Check,
  CreditCard,
  FilePenLine,
  FilePlus2,
  ReceiptText,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatDateTime } from "@/lib/constants";

type TimelineEvent = {
  title: string;
  detail: string;
  timestamp: string;
  icon: LucideIcon;
  tone: "neutral" | "success" | "danger" | "info";
  note?: string | null;
};

const TONE_STYLES: Record<TimelineEvent["tone"], string> = {
  neutral: "bg-slate-200 text-slate-700",
  success: "bg-emerald-600 text-white",
  danger: "bg-red-600 text-white",
  info: "bg-blue-600 text-white",
};

function buildEvents(request: ConEdRequest): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      title: "Request created",
      detail: `Created by ${request.employeeName ?? "employee"}`,
      timestamp: request.createdAt,
      icon: FilePlus2,
      tone: "neutral",
    },
  ];

  if (request.repaymentGuarantee) {
    events.push({
      title: "Repayment guarantee signed",
      detail: `Signed by ${request.repaymentGuarantee.signedName}`,
      timestamp: request.repaymentGuarantee.signedAt,
      icon: FilePenLine,
      tone: "info",
    });
  }

  if (request.managerApprovedAt) {
    events.push({
      title: "Manager approved",
      detail: `Approved by ${request.managerName ?? "manager"}`,
      timestamp: request.managerApprovedAt,
      icon: Check,
      tone: "success",
    });
  }

  if (request.managerDeniedAt) {
    events.push({
      title: "Manager denied",
      detail: `Denied by ${request.managerName ?? "manager"}`,
      timestamp: request.managerDeniedAt,
      icon: X,
      tone: "danger",
      note: request.managerDenialReason,
    });
  }

  if (request.boApprovedAt) {
    events.push({
      title: "Business Office approved",
      detail: `Approved by ${request.boApproverName ?? "Business Office"}`,
      timestamp: request.boApprovedAt,
      icon: Check,
      tone: "success",
    });
  }

  if (request.boDeniedAt) {
    events.push({
      title: "Business Office denied",
      detail: `Denied by ${request.boApproverName ?? "Business Office"}`,
      timestamp: request.boDeniedAt,
      icon: X,
      tone: "danger",
      note: request.boDenialReason,
    });
  }

  for (const receipt of request.receipts ?? []) {
    events.push({
      title: "Receipt submitted",
      detail: receipt.fileName || "Receipt uploaded",
      timestamp: receipt.uploadedAt,
      icon: ReceiptText,
      tone: "info",
    });
  }

  if (request.reimbursement) {
    events.push({
      title: "Reimbursement recorded",
      detail: request.reimbursement.markedByName
        ? `Processed by ${request.reimbursement.markedByName}`
        : "Processed by Accounting",
      timestamp: request.reimbursement.markedAt,
      icon: CreditCard,
      tone: "success",
      note: `Paycheck date: ${new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${request.reimbursement.paycheckDate}T00:00:00Z`))}`,
    });
  }

  return events.sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

export function RequestTimeline({ request }: { request: ConEdRequest }) {
  const events = buildEvents(request);

  return (
    <ol className="relative ml-2 border-l border-slate-200 pl-6">
      {events.map((event, index) => {
        const Icon = event.icon;
        return (
          <li
            key={`${event.title}-${event.timestamp}-${index}`}
            className={index === events.length - 1 ? "relative" : "relative pb-6"}
          >
            <span
              className={`absolute -left-[35px] top-0 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${TONE_STYLES[event.tone]}`}
            >
              <Icon aria-hidden="true" className="h-3 w-3" />
            </span>
            <h3 className="text-sm font-semibold text-slate-900">{event.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(event.timestamp)}</p>
            <p className="mt-1 text-sm text-slate-600">{event.detail}</p>
            {event.note && (
              <p className={`mt-2 rounded border px-3 py-2 text-sm ${event.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                {event.note}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
