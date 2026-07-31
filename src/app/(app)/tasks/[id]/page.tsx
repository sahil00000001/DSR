import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  Clock3,
  FolderOpen,
  History,
  Link2,
  ListChecks,
  MessageSquare,
  Paperclip,
  Pencil,
  Repeat,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PersonCell } from "@/components/ui/avatar";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth/session";
import { can, isAdmin } from "@/lib/auth/rbac";
import {
  getTask,
  getTaskAttachments,
  getTaskChecklist,
  getTaskPolicySubject,
  getTaskTimeline,
  getTaskUpdates,
} from "@/lib/services/tasks";
import { listEmployees } from "@/lib/services/people";
import { isStorageConfigured } from "@/lib/storage/supabase-storage";
import {
  TASK_PRIORITY_LABEL,
  TASK_RECURRENCE_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/constants/enums";
import { formatDateTime, formatDayLong } from "@/lib/utils/date";
import { formatDuration } from "@/lib/utils/format";
import { MarkdownView } from "@/components/markdown-view";
import { DueChip, PriorityBadge, StatusBadge, TagRow } from "@/components/tasks/task-bits";
import { TaskThread } from "@/components/tasks/task-thread";
import {
  ProgressControl,
  StatusControl,
  TaskChecklist,
} from "@/components/tasks/task-controls";
import { TaskActivityFeed } from "@/components/tasks/task-activity";
import { TaskAttachments } from "@/components/tasks/task-attachments";
import { TaskDangerZone } from "@/components/tasks/task-danger-zone";
import { MarkSeen } from "@/components/tasks/mark-seen";

/**
 * Authorised in `generateMetadata` too.
 *
 * It runs independently of the page component, so the `notFound()` below does not stop
 * a title being computed and sent — the leak found on the expense claim page. Both
 * reads are `cache()`d per request, so the check is free.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [user, task, subject] = await Promise.all([
    requireUser(),
    getTask(id),
    getTaskPolicySubject(id),
  ]);
  if (!task || !subject) return { title: "Task not found" };
  if (!can.viewTask(user, subject)) return { title: "Task not found" };
  return { title: `${task.taskNumber} — ${task.title}` };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [task, subject] = await Promise.all([getTask(id), getTaskPolicySubject(id)]);
  if (!task || !subject) notFound();

  // 404 rather than 403: an employee shouldn't be able to confirm a task id exists.
  if (!can.viewTask(user, subject)) notFound();

  const assigneeIds = task.assignees.map((person) => person.id);
  const canPost = can.updateTask(user, { assigneeIds });
  const canEdit = can.editTask(user);

  // Signed only now, after authorisation — see the note in `getTaskAttachments`.
  const [attachments, updates, timeline, checklist, employees] = await Promise.all([
    getTaskAttachments(id),
    getTaskUpdates(id),
    getTaskTimeline(id),
    getTaskChecklist(id),
    canPost ? listEmployees({ status: ["ACTIVE"] }, user) : Promise.resolve([]),
  ]);

  const openBlockers = task.dependsOn.filter((dep) => dep.status !== "COMPLETED");

  return (
    <>
      {/* Stamps the assignment as seen, so "has anyone read this?" is answerable. */}
      {assigneeIds.includes(user.id) ? <MarkSeen taskId={task.id} /> : null}

      <PageHeader
        breadcrumbs={[{ label: "Tasks", href: "/tasks" }, { label: task.taskNumber }]}
        title={task.title}
        meta={
          <>
            <StatusBadge status={task.status} size="md" />
            <PriorityBadge priority={task.priority} size="md" />
            {task.recurrence !== "NONE" ? (
              <Badge tone="neutral" variant="outline">
                <Repeat className="size-3" aria-hidden="true" />
                {TASK_RECURRENCE_LABEL[task.recurrence]}
                {task.recurrenceEvery > 1 ? ` ×${task.recurrenceEvery}` : ""}
              </Badge>
            ) : null}
            {task.counts.attachments > 0 ? (
              <Badge tone="neutral" variant="outline">
                <Paperclip className="size-3" aria-hidden="true" />
                {task.counts.attachments}
              </Badge>
            ) : null}
            <DueChip dueOn={task.dueOn} deadlineAt={task.deadlineAt} status={task.status} />
          </>
        }
        actions={
          <>
            <PrintButton label="Print" />
            {canEdit ? (
              <ButtonLink href={`/tasks/${task.id}/edit`} variant="secondary" size="sm">
                <Pencil className="size-4" />
                Edit
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {openBlockers.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft/40 px-3 py-2.5">
          <Link2 className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[12.5px] text-warning-text">
            Waits on{" "}
            {openBlockers.map((dep, index) => (
              <span key={dep.id}>
                {index > 0 ? ", " : ""}
                <Link href={`/tasks/${dep.id}`} className="font-medium underline underline-offset-2">
                  {dep.taskNumber}
                </Link>
              </span>
            ))}{" "}
            — it can&apos;t be completed until {openBlockers.length === 1 ? "that is" : "those are"}{" "}
            finished.
          </p>
        </div>
      ) : null}

      {task.blockedReason ? (
        <div className="mb-5 rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-danger-text uppercase">
            Blocked
          </p>
          <p className="mt-1 text-[13px] leading-[19px] text-danger-text">{task.blockedReason}</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>What needs doing</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownView source={task.description} />
              {task.tags.length > 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <TagRow tags={task.tags} max={12} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          {attachments.filter((file) => !file.taskUpdateId).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paperclip className="size-3.5 text-fg-subtle" aria-hidden="true" />
                  Supporting files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TaskAttachments
                  attachments={attachments.filter((file) => !file.taskUpdateId)}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-3.5 text-fg-subtle" aria-hidden="true" />
                Updates
                {task.counts.updates > 0 ? (
                  <Badge tone="neutral" variant="outline" size="sm">
                    {task.counts.updates}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TaskThread
                taskId={task.id}
                updates={updates}
                canPost={canPost}
                storageReady={isStorageConfigured()}
                viewer={{
                  id: user.id,
                  name: user.name,
                  avatarUrl: user.avatarUrl ?? null,
                  role: user.role,
                }}
                people={employees
                  .filter((employee) => employee.id !== user.id)
                  .map((employee) => ({
                    id: employee.id,
                    name: employee.name,
                    avatarUrl: employee.avatarUrl,
                    designation: employee.designation,
                  }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-3.5 text-fg-subtle" aria-hidden="true" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TaskActivityFeed activities={timeline} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          {canPost ? (
            <Card className="border-accent/25">
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatusControl
                  taskId={task.id}
                  taskNumber={task.taskNumber}
                  status={task.status}
                />

                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
                    Progress
                  </p>
                  <ProgressControl
                    taskId={task.id}
                    percent={task.progressPercent}
                    status={task.status}
                    checklistDriven={checklist.length > 0}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressControl
                  taskId={task.id}
                  percent={task.progressPercent}
                  status={task.status}
                  checklistDriven={checklist.length > 0}
                  disabled
                />
                <p className="mt-2 text-[11.5px] text-fg-subtle">
                  You can see this task but not change it — only the people assigned, or an
                  admin, can.
                </p>
              </CardContent>
            </Card>
          )}

          {checklist.length > 0 ? (
            <Card>
              <CardContent className="pt-4">
                <TaskChecklist taskId={task.id} items={checklist} disabled={!canPost} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-3.5 text-fg-subtle" aria-hidden="true" />
                Assigned to
                <Badge tone="neutral" variant="outline" size="sm">
                  {task.assignees.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {task.assignees.length === 0 ? (
                <p className="text-[12.5px] text-fg-subtle">
                  Nobody is assigned. {canEdit ? "Edit the task to fix that." : ""}
                </p>
              ) : (
                task.assignees.map((person) => (
                  <div key={person.id} className="flex items-center justify-between gap-2">
                    <Link href={`/employees/${person.id}`} className="min-w-0 hover:underline">
                      <PersonCell
                        name={person.name}
                        seed={person.id}
                        src={person.avatarUrl}
                        size="sm"
                        meta={person.designation ?? person.department ?? undefined}
                      />
                    </Link>
                    {/* Acknowledgement, so chasing is informed rather than a guess. */}
                    <span
                      className="shrink-0 text-[10.5px] text-fg-subtle"
                      title={
                        person.seenAt
                          ? `Opened ${formatDateTime(person.seenAt)}`
                          : "Has not opened this task yet"
                      }
                    >
                      {person.seenAt ? "seen" : "unseen"}
                    </span>
                  </div>
                ))
              )}

              {canEdit ? (
                <ButtonLink
                  href={`/tasks/${task.id}/edit`}
                  variant="secondary"
                  size="xs"
                  className="w-full"
                >
                  <UserPlus className="size-3.5" />
                  Change assignees
                </ButtonLink>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 text-[12.5px]">
              <Detail icon={<ListChecks />} label="Reference">
                <span className="font-mono text-fg">{task.taskNumber}</span>
              </Detail>

              <Detail icon={<CalendarClock />} label="Due">
                {task.dueOn ? (
                  <>
                    <span className="block text-fg">{formatDayLong(task.dueOn)}</span>
                    {task.deadlineAt ? (
                      <span className="block text-fg-subtle">
                        by{" "}
                        {task.deadlineAt.toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Kolkata",
                        })}{" "}
                        IST
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-fg-subtle">No due date</span>
                )}
              </Detail>

              {task.estimateMinutes ? (
                <Detail icon={<Clock3 />} label="Estimate">
                  <span className="text-fg">{formatDuration(task.estimateMinutes)}</span>
                </Detail>
              ) : null}

              {task.category ? (
                <Detail icon={<FolderOpen />} label="Project">
                  <span className="flex items-center gap-1.5 text-fg">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: `var(--cat-${task.category.color})` }}
                    />
                    {task.category.name}
                  </span>
                </Detail>
              ) : null}

              <Detail icon={<UserPlus />} label="Created by">
                <Link href={`/employees/${task.createdBy.id}`} className="hover:underline">
                  <PersonCell
                    name={task.createdBy.name}
                    seed={task.createdBy.id}
                    src={task.createdBy.avatarUrl}
                    size="sm"
                    meta={formatDateTime(task.createdAt)}
                  />
                </Link>
              </Detail>

              {task.startedAt ? (
                <Detail icon={<Clock3 />} label="Started">
                  <span className="text-fg">{formatDateTime(task.startedAt)}</span>
                </Detail>
              ) : null}

              {task.completedAt ? (
                <Detail icon={<Clock3 />} label="Completed">
                  <span className="text-fg">{formatDateTime(task.completedAt)}</span>
                </Detail>
              ) : null}

              {task.reopenedAt ? (
                <Detail icon={<History />} label="Reopened">
                  <span className="text-warning-text">{formatDateTime(task.reopenedAt)}</span>
                </Detail>
              ) : null}

              {task.dependsOn.length > 0 ? (
                <Detail icon={<Link2 />} label="Waits on">
                  <ul className="space-y-1">
                    {task.dependsOn.map((dep) => (
                      <li key={dep.id}>
                        <Link
                          href={`/tasks/${dep.id}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <span className="font-mono text-[11px] text-fg-subtle">
                            {dep.taskNumber}
                          </span>
                          <span
                            className={
                              dep.status === "COMPLETED" ? "text-fg-subtle line-through" : "text-fg"
                            }
                          >
                            {TASK_STATUS_LABEL[dep.status]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Detail>
              ) : null}

              <Detail icon={<ListChecks />} label="Priority">
                <span className="text-fg">{TASK_PRIORITY_LABEL[task.priority]}</span>
              </Detail>
            </CardContent>
          </Card>

          {isAdmin(user) ? (
            <TaskDangerZone taskId={task.id} taskNumber={task.taskNumber} title={task.title} />
          ) : null}
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
