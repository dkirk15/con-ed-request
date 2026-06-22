---
name: OSS Request Lifecycle
description: Status flow and enforcement rules for OSS con-ed requests
---

Status flow: draft → pending_manager → pending_bo → awaiting_receipt → receipt_submitted → reimbursed

**Key enforcement rules:**
- Repayment guarantee is validated at POST /api/requests/:id/submit (not at manager-approve)
- Draft status is the initial state; submit endpoint moves draft → pending_manager
- Manager sees only pending_manager requests (not drafts)
- Cancel is allowed for draft, pending_manager, pending_bo

**Why:** Code reviewer required guarantee enforcement before submission, not at approval time. Draft lifecycle was added to satisfy reviewer requirements for explicit submission step.

**How to apply:** Any new status checks must respect this flow order. Balance logic must NOT count draft requests as pending.
