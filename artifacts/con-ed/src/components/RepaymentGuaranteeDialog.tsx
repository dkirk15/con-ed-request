import type { ReactNode } from "react";
import type { RepaymentGuarantee } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/constants";
import { PenTool } from "lucide-react";

const OSS_POLICY_TEXT =
  "Olympic Sports & Spine (OSS) has advanced to me continuing education funding upon my request. To reimburse OSS for this advance, I agree to designate continuing education benefits that will be accrued through my future work hours in the amount necessary to satisfy this debt. In the event that my employment with OSS is terminated, either voluntarily or involuntarily, I agree to repay OSS for any advanced continuing education balance that remains unsatisfied after all future benefit accruals are applied.";

export function RepaymentGuaranteeDialog({
  guarantees,
  children,
}: {
  guarantees: RepaymentGuarantee[];
  children: ReactNode;
}) {
  const plural = guarantees.length > 1;
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <PenTool className="h-5 w-5" /> Repayment Agreement{plural ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Signed OSS Repayment Policy and electronic-signature audit record.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-4">
          {OSS_POLICY_TEXT}
        </p>

        <div className="space-y-4">
          {guarantees.map((g) => (
            <div key={g.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Request #{g.requestId}
                </span>
                <span
                  className={`text-xs font-medium ${
                    g.acknowledged ? "text-green-700" : "text-amber-700"
                  }`}
                >
                  {g.acknowledged ? "Acknowledged" : "Not acknowledged"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <div className="text-slate-500">Electronically Signed By</div>
                  <div className="font-medium text-slate-900">{g.signedName}</div>
                </div>
                <div>
                  <div className="text-slate-500">Date Signed</div>
                  <div className="font-medium text-slate-900">{formatDate(g.signedDate)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Recorded On</div>
                  <div className="font-medium text-slate-900">{formatDate(g.signedAt)}</div>
                </div>
                {g.email && (
                  <div className="col-span-2">
                    <div className="text-slate-500">Email</div>
                    <div className="font-medium break-all">{g.email}</div>
                  </div>
                )}
              </div>

              {(g.ipAddress || g.sessionId) && (
                <div className="text-xs text-slate-400 border-t pt-2 space-y-1">
                  <div className="font-medium text-slate-500 uppercase tracking-wider text-[10px]">
                    Audit Trail
                  </div>
                  {g.ipAddress && <div>IP Address: {g.ipAddress}</div>}
                  {g.sessionId && <div className="break-all">Session: {g.sessionId}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
