import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  Hash,
  MessageSquare,
  Paperclip,
  Receipt,
  Store,
  Tag,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth/session";
import { can, isAdmin } from "@/lib/auth/rbac";
import {
  getClaimAttachments,
  getClaimComments,
  getExpenseClaim,
} from "@/lib/services/expenses";
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_MEANING,
  EXPENSE_STATUS_TONE,
} from "@/lib/constants/enums";
import { formatDayLong } from "@/lib/utils/date";
import { firstName, formatMoney } from "@/lib/utils/format";
import { MarkdownView } from "@/components/markdown-view";
import { ExpenseTimeline } from "@/components/expenses/expense-timeline";
import { ReceiptGallery } from "@/components/expenses/receipt-gallery";
import { ExpenseThread } from "@/components/expenses/expense-thread";
import { ExpenseDecisionPanel } from "@/components/expenses/expense-decision-panel";

/**
 * The title is authorised too.
 *
 * `generateMetadata` runs independently of the page component, so a `notFound()` in
 * the body does **not** stop it — without this check an employee who guessed a
 * claim id got a blocked page whose `<title>` still read
 * "EXP-0002 — Courier charges for statutory filings". Both reads are `cache()`d
 * per request, so checking here costs nothing.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [user, claim] = await Promise.all([requireUser(), getExpenseClaim(id)]);
  if (!claim) return { title: "Claim not found" };
  if (!can.viewExpense(user, { id: claim.user.id, managerId: claim.user.managerId })) {
    return { title: "Claim not found" };
  }
  return { title: `${claim.claimNumber} — ${claim.title}` };
}

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const claim = await getExpenseClaim(id);
  if (!claim) notFound();

  const subject = { id: claim.user.id, managerId: claim.user.managerId };

  // 404 rather than 403: an employee shouldn't be able to confirm that a
  // colleague's claim id exists.
  if (!can.viewExpense(user, subject)) notFound();

  // Signed only now, after authorisation — see the note in `getClaimAttachments`.
  const [attachments, comments] = await Promise.all([
    getClaimAttachments(id),
    getClaimComments(id),
  ]);

  const isOwn = claim.user.id === user.id;
  const canDecide = claim.status === "SUBMITTED" && can.decideExpense(user, subject);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          isOwn
            ? { label: "Expenses", href: "/expenses" }
            : { label: "Review", href: "/expenses/review" },
          { label: claim.claimNumber },
        ]}
        title={claim.title}
        meta={
          <>
            <Badge tone={EXPENSE_STATUS_TONE[claim.status]} dot>
              {EXPENSE_STATUS_LABEL[claim.status]}
            </Badge>
            <Badge tone="neutral" variant="outline">
              {formatMoney(claim.amountMinor, claim.currency)}
            </Badge>
            <Badge tone="neutral" variant="outline">
              {EXPENSE_CATEGORY_LABEL[claim.category]}
            </Badge>
            {claim.attachmentCount > 0 ? (
              <Badge tone="neutral" variant="outline">
                <Paperclip className="size-3" aria-hidden="true" />
                {claim.attachmentCount} receipt{claim.attachmentCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </>
        }
        description={
          isOwn ? EXPENSE_STATUS_MEANING[claim.status] : `Filed by ${claim.user.name}.`
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {/* The headline number, given the prominence it has on the actual bill. */}
          <Card>
            <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-5">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
                  Amount claimed
                </p>
                <p className="mt-1 text-3xl leading-none font-semibold tabular-nums text-fg">
                  {formatMoney(claim.amountMinor, claim.currency)}
                </p>
                <p className="mt-1.5 text-[12.5px] text-fg-muted">
                  Spent on {formatDayLong(claim.expenseDate)}
                  {claim.vendor ? ` at ${claim.vendor}` : ""}
                </p>
              </div>

              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
                <div>
                  <dt className="text-fg-subtle">Claim</dt>
                  <dd className="font-mono font-medium tabular-nums text-fg">
                    {claim.claimNumber}
                  </dd>
                </div>
                {claim.referenceNo ? (
                  <div>
                    <dt className="text-fg-subtle">Bill no.</dt>
                    <dd className="font-medium text-fg">{claim.referenceNo}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-fg-subtle">Category</dt>
                  <dd className="font-medium text-fg">
                    {EXPENSE_CATEGORY_LABEL[claim.category]}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What this was for</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownView source={claim.description} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="size-3.5 text-fg-subtle" aria-hidden="true" />
                Receipts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiptGallery attachments={attachments} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-3.5 text-fg-subtle" aria-hidden="true" />
                Discussion
                {comments.length > 0 ? (
                  <Badge tone="neutral" variant="outline" size="sm">
                    {comments.length}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExpenseThread
                claimId={claim.id}
                comments={comments}
                claimantId={claim.user.id}
                viewer={{
                  id: user.id,
                  name: user.name,
                  avatarUrl: user.avatarUrl ?? null,
                  role: user.role,
                }}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <ExpenseDecisionPanel
            claimId={claim.id}
            claimNumber={claim.claimNumber}
            claimantFirstName={firstName(claim.user.name)}
            amountMinor={claim.amountMinor}
            currency={claim.currency}
            canDecide={canDecide}
            canReimburse={claim.status === "APPROVED" && isAdmin(user)}
            canSubmit={claim.status === "DRAFT" && isOwn}
            canCancel={
              claim.status !== "DRAFT" && can.cancelExpense(user, subject, claim.status)
            }
          />

          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ExpenseTimeline
                status={claim.status}
                createdAt={claim.createdAt}
                submittedAt={claim.submittedAt}
                decidedAt={claim.decidedAt}
                decidedByName={claim.decidedBy?.name ?? null}
                decisionNote={claim.decisionNote}
                reimbursedAt={claim.reimbursedAt}
                claimantFirstName={isOwn ? "you" : firstName(claim.user.name)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 text-[12.5px]">
              <Detail icon={<User />} label="Claimed by">
                <Link href={`/employees/${claim.user.id}`} className="hover:underline">
                  <PersonCell
                    name={claim.user.name}
                    seed={claim.user.id}
                    src={claim.user.avatarUrl}
                    size="sm"
                    meta={claim.user.designation ?? undefined}
                  />
                </Link>
              </Detail>

              {claim.user.department ? (
                <Detail icon={<Building2 />} label="Department">
                  <span className="flex items-center gap-1.5 text-fg">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: claim.user.department.color }}
                    />
                    {claim.user.department.name}
                  </span>
                </Detail>
              ) : null}

              <Detail icon={<CalendarDays />} label="Date on the bill">
                <span className="text-fg">{formatDayLong(claim.expenseDate)}</span>
              </Detail>

              <Detail icon={<Tag />} label="Category">
                <span className="text-fg">{EXPENSE_CATEGORY_LABEL[claim.category]}</span>
              </Detail>

              {claim.vendor ? (
                <Detail icon={<Store />} label="Paid to">
                  <span className="text-fg">{claim.vendor}</span>
                </Detail>
              ) : null}

              {claim.referenceNo ? (
                <Detail icon={<Hash />} label="Bill / reference">
                  <span className="text-fg">{claim.referenceNo}</span>
                </Detail>
              ) : null}

              <Detail icon={<Receipt />} label="Employee code">
                <span className="font-mono text-fg">{claim.user.employeeCode}</span>
              </Detail>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
        <span className="[&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        {label}
      </p>
      <div className="text-fg-muted">{children}</div>
    </div>
  );
}
