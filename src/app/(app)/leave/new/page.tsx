import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getApproversFor, getHolidayKeys, getLeaveBalances } from "@/lib/services/leave";
import { addMonths, subDays, today } from "@/lib/utils/date";
import { listSentence } from "@/lib/utils/format";
import { LeaveForm } from "@/components/leave/leave-form";

export const metadata: Metadata = {
  title: "Request leave",
  description: "Submit a leave request.",
};

export default async function NewLeavePage() {
  const user = await requireUser();
  const now = today();

  const [balances, holidayKeys, approvers] = await Promise.all([
    getLeaveBalances(user.id),
    // A generous window either side of today, so the live day count in the form
    // matches the server's for any plausible request.
    getHolidayKeys({ start: subDays(now, 45), end: addMonths(now, 14) }),
    getApproversFor(user.id),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Leave", href: "/leave" }, { label: "New request" }]}
        title="Request leave"
        description={
          approvers.length > 0
            ? `${listSentence(approvers.map((approver) => approver.name))} will be notified as soon as you submit.`
            : "Your request will be sent to the admins for a decision."
        }
      />

      <div className="max-w-3xl">
        <LeaveForm
          balances={balances}
          holidayKeys={[...holidayKeys]}
          approverName={approvers[0]?.name ?? null}
        />
      </div>
    </>
  );
}
