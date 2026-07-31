import {
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCheck,
  CircleDot,
  Flag,
  Link2,
  ListPlus,
  MessageSquare,
  Mic,
  Paperclip,
  Pencil,
  Percent,
  Plus,
  Repeat,
  RotateCcw,
  SquareCheckBig,
  Tag,
  Trash2,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import {
  TASK_ACTIVITY_LABEL,
  TASK_STATUS_LABEL,
  asTaskStatus,
  type TaskActivityKind,
} from "@/lib/constants/enums";
import { formatDateTime, formatRelative } from "@/lib/utils/date";
import { listSentence } from "@/lib/utils/format";
import type { TaskActivityDto } from "@/lib/services/tasks";

/**
 * The task timeline — section 4 of the brief.
 *
 * A Server Component, and deliberately dumb: it renders what the service recorded and
 * invents nothing. Every entry carries who, when, what, and — where it makes sense —
 * the before and after, which is what turns a feed into an audit trail.
 *
 * Detail is reconstructed from the activity's `meta` rather than re-derived from the
 * task's current state. "Priority went Medium → Critical" has to keep saying that even
 * after somebody later moves it back.
 */

const ICONS: Record<TaskActivityKind, LucideIcon> = {
  created: Plus,
  assigned: UserPlus,
  unassigned: UserMinus,
  status_changed: CircleDot,
  priority_changed: Flag,
  progress_changed: Percent,
  due_date_changed: CalendarClock,
  commented: MessageSquare,
  attachment_added: Paperclip,
  attachment_removed: Trash2,
  recording_added: Mic,
  tag_added: Tag,
  tag_removed: Tag,
  checklist_added: ListPlus,
  checklist_completed: SquareCheckBig,
  dependency_added: Link2,
  dependency_removed: Link2,
  completed: CheckCheck,
  reopened: RotateCcw,
  blocked: Ban,
  unblocked: CircleDot,
  edited: Pencil,
  spawned: Repeat,
};

/** Entries worth colouring — the ones a person scans the timeline looking for. */
const TONES: Partial<Record<TaskActivityKind, string>> = {
  created: "border-accent/30 bg-accent-soft text-accent",
  completed: "border-success/30 bg-success-soft text-success-text",
  blocked: "border-danger/30 bg-danger-soft text-danger-text",
  reopened: "border-warning/40 bg-warning-soft text-warning-text",
  unblocked: "border-success/30 bg-success-soft text-success-text",
};

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** The human sentence for one entry, built from its recorded detail. */
function describe(activity: TaskActivityDto): string | null {
  const meta = activity.meta ?? {};

  switch (activity.kind) {
    case "assigned": {
      const names = asStringList(meta.to);
      return names.length > 0 ? `to ${listSentence(names)}` : null;
    }
    case "unassigned": {
      const names = asStringList(meta.from);
      return names.length > 0 ? `${listSentence(names)} removed` : null;
    }
    case "status_changed":
    case "completed":
    case "reopened":
    case "blocked":
    case "unblocked": {
      const from = typeof meta.from === "string" ? asTaskStatus(meta.from) : null;
      const to = typeof meta.to === "string" ? asTaskStatus(meta.to) : null;
      if (!from || !to) return null;
      return `${TASK_STATUS_LABEL[from]} → ${TASK_STATUS_LABEL[to]}`;
    }
    case "priority_changed":
      return typeof meta.from === "string" && typeof meta.to === "string"
        ? `${titleCase(meta.from)} → ${titleCase(meta.to)}`
        : null;
    case "progress_changed":
      return typeof meta.to === "number" ? `${meta.from ?? 0}% → ${meta.to}%` : null;
    case "due_date_changed": {
      const from = typeof meta.from === "string" ? meta.from : null;
      const to = typeof meta.to === "string" ? meta.to : null;
      if (!from && !to) return null;
      if (!from) return `set to ${to}`;
      if (!to) return "removed";
      return `${from} → ${to}`;
    }
    case "attachment_added":
    case "recording_added": {
      const files = asStringList(meta.files);
      return files.length > 0 ? listSentence(files) : null;
    }
    case "checklist_added":
      return typeof meta.count === "number"
        ? `${meta.count} item${meta.count === 1 ? "" : "s"}`
        : null;
    case "checklist_completed": {
      const label = typeof meta.label === "string" ? meta.label : null;
      const done = typeof meta.done === "number" ? meta.done : null;
      const total = typeof meta.total === "number" ? meta.total : null;
      if (!label) return null;
      return done !== null && total !== null ? `${label} (${done}/${total})` : label;
    }
    case "dependency_added":
      return typeof meta.blocker === "string" ? `now waits on ${meta.blocker}` : null;
    case "edited":
      return typeof meta.field === "string" ? `changed the ${meta.field}` : null;
    case "spawned":
      return typeof meta.dueOn === "string" ? `due ${meta.dueOn}` : null;
    default:
      return null;
  }
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function TaskActivityFeed({ activities }: { activities: TaskActivityDto[] }) {
  if (activities.length === 0) {
    return <p className="text-[12.5px] text-fg-subtle">Nothing recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-0">
      {activities.map((activity, index) => {
        const Icon = ICONS[activity.kind];
        const detail = describe(activity);
        const last = index === activities.length - 1;
        const tone = TONES[activity.kind];

        return (
          <li key={activity.id} className="relative flex gap-3 pb-3.5 last:pb-0">
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute top-6 bottom-[-2px] left-[11px] w-px bg-border"
              />
            ) : null}

            <span
              aria-hidden="true"
              className={cn(
                "relative z-1 grid size-[23px] shrink-0 place-items-center rounded-full border",
                tone ?? "border-border bg-surface-inset text-fg-subtle",
              )}
            >
              <Icon className="size-3" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] leading-[18px]">
                {activity.actor ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar
                      name={activity.actor.name}
                      seed={activity.actor.id}
                      src={activity.actor.avatarUrl}
                      size="xs"
                    />
                    <span className="font-medium text-fg">{activity.actor.name}</span>
                  </span>
                ) : (
                  // Cron-created entries have no actor, and saying so is better than
                  // attributing an automatic action to a person.
                  <span className="font-medium text-fg-muted">Automatically</span>
                )}

                <span className="text-fg-muted">{TASK_ACTIVITY_LABEL[activity.kind]}</span>

                {detail ? (
                  <span className="inline-flex items-center gap-1 text-fg-subtle">
                    {activity.kind === "status_changed" ? (
                      <ArrowRight className="size-3" aria-hidden="true" />
                    ) : null}
                    {detail}
                  </span>
                ) : null}

                <time
                  dateTime={activity.createdAt.toISOString()}
                  title={formatDateTime(activity.createdAt)}
                  className="text-[11px] text-fg-subtle"
                >
                  {formatRelative(activity.createdAt)}
                </time>
              </p>

              {activity.comment ? (
                <p className="mt-1 rounded-md border-l-2 border-border bg-surface-inset px-2.5 py-1.5 text-[12px] leading-[17px] text-fg-muted">
                  {activity.comment}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
