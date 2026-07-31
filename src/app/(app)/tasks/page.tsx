import type { Metadata } from "next";
import {
  AlarmClock,
  CircleDot,
  ListChecks,
  Plus,
  SquareCheckBig,
  Users,
} from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { can, isManagerOrAdmin } from "@/lib/auth/rbac";
import {
  getTaskOptions,
  listTasks,
  listTasksForView,
  type TaskFilters as TaskFilterShape,
  type TaskSort,
} from "@/lib/services/tasks";
import { getOrgOptions } from "@/lib/services/people";
import { parseSearchParams, taskFilterSchema } from "@/lib/validation/schemas";
import { tryParseDayKey } from "@/lib/utils/date";
import { formatPercent } from "@/lib/utils/format";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskTable } from "@/components/tasks/task-table";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { TaskTimelineView } from "@/components/tasks/task-timeline-view";
import { TaskPagination } from "@/components/tasks/task-pagination";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Everything assigned, in a list, a board, a calendar or a timeline.",
};

/**
 * Tasks — one page, four views.
 *
 * The view is a query parameter rather than four routes, because every view shares the
 * same filters and the same data. Switching from list to board should keep what you
 * were looking at, and four routes make that a thing you have to remember to wire up
 * rather than something that is true by construction.
 *
 * The list view paginates; the board, calendar and timeline load a bounded slice
 * instead, since all three need the whole set to arrange it.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const resolved = await searchParams;
  const raw = parseSearchParams(taskFilterSchema, resolved);

  const filters: TaskFilterShape = {
    ...raw,
    from: tryParseDayKey(raw.from) ?? undefined,
    to: tryParseDayKey(raw.to) ?? undefined,
  };

  const view = raw.view ?? "list";
  const page = raw.page ?? 1;
  const pageSize = raw.size ?? 25;

  // The list view needs a page and the summary; the arranged views need the set.
  const [listed, viewData, options, taskOptions] = await Promise.all([
    listTasks(filters, user, { page, pageSize, sort: raw.sort as TaskSort | undefined }),
    view === "list"
      ? Promise.resolve(null)
      : listTasksForView(filters, user, view === "board" ? 500 : 300),
    getOrgOptions(),
    getTaskOptions(),
  ]);

  const { summary } = listed;
  const openTotal =
    summary.byStatus.TODO +
    summary.byStatus.IN_PROGRESS +
    summary.byStatus.REVIEW +
    summary.byStatus.BLOCKED;

  const rows = viewData?.rows ?? listed.rows;

  /**
   * Per-task move permission, resolved here rather than in the board.
   *
   * The policy is a server concern, and shipping the rule to the client would mean
   * the board could offer a move the action then rejects.
   */
  const canMove = Object.fromEntries(
    rows.map((task) => [
      task.id,
      can.changeTaskStatus(user, { assigneeIds: task.assignees.map((person) => person.id) }),
    ]),
  );

  return (
    <>
      <PageHeader
        title="Tasks"
        description={
          isManagerOrAdmin(user)
            ? "Everything assigned across the plant, however you prefer to look at it."
            : "Everything assigned to you, and where each piece stands."
        }
        actions={
          can.createTask(user) ? (
            <ButtonLink href="/tasks/new" variant="primary" size="sm">
              <Plus className="size-4" />
              New task
            </ButtonLink>
          ) : undefined
        }
      />

      <StatGrid className="mb-5">
        <StatCard
          label="Open"
          value={openTotal}
          icon={<ListChecks />}
          footnote={
            openTotal === 0
              ? "Nothing outstanding"
              : `${formatPercent(summary.averageOpenProgress)} average progress`
          }
        />
        <StatCard
          label="Overdue"
          value={summary.overdue}
          icon={<AlarmClock />}
          href={summary.overdue > 0 ? "/tasks?scope=overdue" : undefined}
          footnote={summary.overdue === 0 ? "Nothing late" : "Past the due date and still open"}
        />
        <StatCard
          label="In progress"
          value={summary.byStatus.IN_PROGRESS}
          icon={<CircleDot />}
          footnote={
            summary.byStatus.BLOCKED > 0
              ? `${summary.byStatus.BLOCKED} blocked`
              : "Nothing blocked"
          }
        />
        <StatCard
          label="Completed"
          value={summary.byStatus.COMPLETED}
          icon={<SquareCheckBig />}
          footnote={
            summary.byStatus.REVIEW > 0
              ? `${summary.byStatus.REVIEW} waiting on review`
              : "Nothing in review"
          }
        />
      </StatGrid>

      <div className="mb-5">
        <TaskFilters
          basePath="/tasks"
          options={options}
          categories={taskOptions.categories}
          tags={taskOptions.tags}
          showPeople={isManagerOrAdmin(user)}
          counts={{
            overdue: summary.overdue,
            dueToday: summary.dueToday,
            dueThisWeek: summary.dueThisWeek,
          }}
        />
      </div>

      {view === "board" ? (
        <TaskBoard tasks={rows} canMove={canMove} truncated={viewData?.truncated ?? false} />
      ) : view === "calendar" ? (
        <TaskCalendar
          tasks={rows}
          month={raw.month}
          basePath="/tasks"
          searchParams={resolved}
        />
      ) : view === "timeline" ? (
        <TaskTimelineView tasks={rows} />
      ) : (
        <>
          <SectionHeader
            title="Tasks"
            description={
              listed.total === 0
                ? "Nothing matches these filters"
                : `${listed.total} task${listed.total === 1 ? "" : "s"}${
                    summary.unassigned > 0
                      ? ` · ${summary.unassigned} with nobody assigned`
                      : ""
                  }`
            }
            actions={
              summary.unassigned > 0 && isManagerOrAdmin(user) ? (
                <ButtonLink href="/tasks?scope=unassigned" variant="secondary" size="xs">
                  <Users className="size-3.5" />
                  Show unassigned
                </ButtonLink>
              ) : undefined
            }
          />

          <TaskTable
            tasks={listed.rows}
            emptyAction={
              can.createTask(user) ? (
                <ButtonLink href="/tasks/new" variant="primary" size="sm">
                  <Plus className="size-4" />
                  Create the first task
                </ButtonLink>
              ) : undefined
            }
          />

          {listed.total > pageSize ? (
            <div className="mt-4">
              <TaskPagination page={page} pageSize={pageSize} total={listed.total} />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
