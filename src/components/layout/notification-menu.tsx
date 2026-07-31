"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarCheck,
  CheckCheck,
  ClipboardCheck,
  FileText,
  IndianRupee,
  Megaphone,
  MessageSquare,
  Plane,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { PopoverPanel, usePopover } from "@/components/ui/popover";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { formatRelative } from "@/lib/utils/date";
import type { NotificationType } from "@/lib/constants/enums";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  read: boolean;
}

/** Icon per notification type — a second channel alongside the text. */
const ICONS: Partial<Record<NotificationType, typeof Bell>> = {
  LEAVE_SUBMITTED: Plane,
  LEAVE_APPROVED: Plane,
  LEAVE_REJECTED: Plane,
  LEAVE_CANCELLED: Plane,
  DSR_REMINDER: FileText,
  DSR_REVIEWED: ClipboardCheck,
  DSR_FLAGGED: ClipboardCheck,
  ATTENDANCE_REMINDER: CalendarCheck,
  EXPENSE_SUBMITTED: Receipt,
  EXPENSE_APPROVED: Receipt,
  EXPENSE_REJECTED: Receipt,
  EXPENSE_REIMBURSED: IndianRupee,
  EXPENSE_COMMENT: MessageSquare,
  ANNOUNCEMENT: Megaphone,
};

const TONE: Partial<Record<NotificationType, string>> = {
  LEAVE_APPROVED: "text-success",
  LEAVE_REJECTED: "text-danger",
  DSR_FLAGGED: "text-warning",
  DSR_REVIEWED: "text-success",
  EXPENSE_APPROVED: "text-success",
  EXPENSE_REJECTED: "text-danger",
  EXPENSE_REIMBURSED: "text-success",
  ANNOUNCEMENT: "text-accent",
};

/** How often to look for new notifications while the tab is visible. */
const POLL_INTERVAL_MS = 45_000;

/**
 * Notification tray.
 *
 * Delivery is by polling rather than websockets — a deliberate trade for a
 * 20-person tool deployed to serverless, where a persistent connection per user
 * costs far more than it's worth. Polling pauses entirely while the tab is
 * hidden and refreshes immediately on focus, so an idle tab costs nothing and a
 * returning user sees current state at once.
 *
 * Swapping in SSE later means changing only `useNotificationFeed`.
 */
export function NotificationMenu({
  initialItems,
  initialUnread,
}: {
  initialItems: NotificationItem[];
  initialUnread: number;
}) {
  const { open, close, triggerProps, panelProps } = usePopover();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { items: NotificationItem[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // Offline or transient — keep showing what we have.
    }
  }, []);

  useEffect(() => {
    let timer: number | undefined;

    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearInterval(timer);
      } else {
        void refresh();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const markRead = async (ids: string[] | "all") => {
    // Optimistic: the tray should feel instant even on a slow connection.
    setItems((current) =>
      current.map((item) =>
        ids === "all" || ids.includes(item.id) ? { ...item, read: true } : item,
      ),
    );
    setUnread((current) => (ids === "all" ? 0 : Math.max(0, current - ids.length)));

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
      });
      startTransition(() => router.refresh());
    } catch {
      void refresh(); // Reconcile with the server on failure.
    }
  };

  const onItemClick = (item: NotificationItem) => {
    if (!item.read) void markRead([item.id]);
    close();
    if (item.href) router.push(item.href);
  };

  return (
    <>
      <Tooltip content={unread > 0 ? `${unread} unread` : "Notifications"}>
        <button
          type="button"
          {...triggerProps}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn(
            "relative grid size-9 place-items-center rounded-lg text-fg-muted transition-colors outline-none",
            "hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
            open && "bg-surface-hover text-fg",
          )}
        >
          <Bell className="size-[18px]" />
          {unread > 0 ? (
            <span
              className="absolute top-1.5 right-1.5 grid min-w-[15px] place-items-center rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-fg ring-2 ring-surface"
              aria-hidden="true"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </Tooltip>

      <PopoverPanel
        {...panelProps}
        align="end"
        aria-label="Notifications"
        bare
        className="w-[min(23rem,calc(100vw-1.5rem))]"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-fg">
            Notifications
            {unread > 0 ? <span className="ml-1.5 text-fg-subtle tabular-nums">({unread})</span> : null}
          </h2>
          {unread > 0 ? (
            <Button variant="ghost" size="xs" onClick={() => markRead("all")} loading={isPending}>
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Bell className="size-4" />}
              title="You're all caught up"
              description="Approvals, reviews and reminders will appear here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const Icon = ICONS[item.type] ?? Bell;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(item)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover",
                        !item.read && "bg-accent-soft/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-muted",
                          TONE[item.type] ?? "text-fg-subtle",
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="size-3.5" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span
                            className={cn(
                              "min-w-0 flex-1 text-[13px] leading-[18px]",
                              item.read ? "font-medium text-fg-muted" : "font-semibold text-fg",
                            )}
                          >
                            {item.title}
                          </span>
                          {!item.read ? (
                            <span
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                              aria-label="Unread"
                            />
                          ) : null}
                        </span>
                        {item.body ? (
                          <span className="mt-0.5 block line-clamp-2 text-[12px] leading-4 text-fg-subtle">
                            {item.body}
                          </span>
                        ) : null}
                        <time
                          dateTime={item.createdAt}
                          className="mt-1 block text-[11px] text-fg-subtle"
                        >
                          {formatRelative(item.createdAt)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-surface-inset px-4 py-2">
          <button
            type="button"
            onClick={() => {
              close();
              router.push("/notifications");
            }}
            className="text-[12.5px] font-medium text-accent underline-offset-2 hover:underline"
          >
            View all notifications
          </button>
        </div>
      </PopoverPanel>
    </>
  );
}
