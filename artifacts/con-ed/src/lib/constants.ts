export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_manager: "Pending Manager Approval",
  manager_approved: "Manager Approved",
  manager_denied: "Manager Denied",
  pending_bo: "Pending CE Approval",
  bo_approved: "CE Approved",
  bo_denied: "CE Denied",
  awaiting_receipt: "Awaiting Receipt",
  receipt_submitted: "Receipt Submitted",
  reimbursed: "Reimbursed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending_manager: "secondary",
  manager_approved: "default",
  manager_denied: "destructive",
  pending_bo: "secondary",
  bo_approved: "default",
  bo_denied: "destructive",
  awaiting_receipt: "outline",
  receipt_submitted: "secondary",
  reimbursed: "default",
  cancelled: "destructive",
};

export const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  business_office: "Business Office",
  accounting: "Accounting",
  admin: "Administrator",
};

export const formatCurrency = (amount: number | null | undefined) => {
  if (amount == null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

export const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
};
