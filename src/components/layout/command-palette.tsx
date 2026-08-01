"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CornerDownLeft,
  FileText,
  Plane,
  ListChecks,
  Package,
  Plus,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { useMounted, useLockBodyScroll } from "@/hooks/use-dom";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { navItemsFor } from "@/components/layout/nav-config";
import type { Role } from "@/lib/constants/enums";

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * The product's global search *and* its fast path to any screen or action — the
 * Raycast/Linear pattern. Local navigation and actions resolve instantly from
 * data already in the client; people and reports come from `/api/search`, which
 * is debounced and cancels superseded requests via AbortController so results
 * never arrive out of order.
 */

interface SearchResults {
  people: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    designation: string | null;
    department: string | null;
  }>;
  reports: Array<{ id: string; date: string; author: string; excerpt: string }>;
  departments: Array<{ id: string; slug: string; name: string; memberCount: number }>;
  leave: Array<{ id: string; author: string; range: string; status: string; type: string }>;
}

const EMPTY: SearchResults = { people: [], reports: [], departments: [], leave: [] };

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  href: string;
  /** Additional match terms. */
  keywords?: string;
}

const QUICK_ACTIONS: PaletteItem[] = [
  {
    id: "action-dsr",
    group: "Actions",
    label: "Write today's status report",
    icon: <Plus className="size-4" />,
    href: "/dsr/new",
    keywords: "dsr create new daily",
  },
  {
    id: "action-leave",
    group: "Actions",
    label: "Request leave",
    icon: <Plane className="size-4" />,
    href: "/leave/new",
    keywords: "holiday time off apply sick casual",
  },
  {
    id: "action-orders-late",
    group: "Actions",
    label: "Show orders running late",
    icon: <Package className="size-4" />,
    href: "/orders?scope=attention",
    keywords: "order late delayed breach risk customer dealer promised",
  },
  {
    id: "action-task-board",
    group: "Actions",
    label: "Open the task board",
    icon: <ListChecks className="size-4" />,
    href: "/tasks?view=board",
    keywords: "kanban board tasks columns drag",
  },
  {
    id: "action-task-overdue",
    group: "Actions",
    label: "Show overdue tasks",
    icon: <ListChecks className="size-4" />,
    href: "/tasks?scope=overdue",
    keywords: "late overdue behind deadline missed",
  },
  {
    id: "action-expense",
    group: "Actions",
    label: "File an expense claim",
    icon: <Receipt className="size-4" />,
    href: "/expenses/new",
    keywords: "claim reimburse bill receipt money spent travel fuel",
  },
  {
    id: "action-attendance",
    group: "Actions",
    label: "Mark attendance",
    icon: <CalendarCheck className="size-4" />,
    href: "/attendance",
    keywords: "present wfh check in today",
  },
];

export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const mounted = useMounted();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 180);

  useLockBodyScroll(open);

  // Global shortcut. `/` also opens it when focus isn't already in a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (isShortcut || (event.key === "/" && !inField && !open)) {
        event.preventDefault();
        setOpen((value) => (isShortcut ? !value : true));
      }
      if (event.key === "Escape" && open) setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Reset between openings so the palette never reopens mid-search.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setResults(EMPTY);
    setActiveIndex(0);
  }, [open]);

  // Remote search. The abort controller is what prevents a slow early request
  // from overwriting the results of a later, faster one.
  useEffect(() => {
    const term = debouncedQuery.trim();
    if (!open || term.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : EMPTY))
      .then((data: SearchResults) => setResults({ ...EMPTY, ...data }))
      .catch(() => {
        // Aborted or offline — leave the previous results in place.
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQuery, open]);

  const items = useMemo<PaletteItem[]>(() => {
    const term = query.trim().toLowerCase();

    const pages: PaletteItem[] = navItemsFor(role).map((item) => ({
      id: `page-${item.href}`,
      group: "Go to",
      label: item.label,
      icon: <item.icon className="size-4" />,
      href: item.href,
      keywords: item.keywords?.join(" "),
    }));

    const local = [...QUICK_ACTIONS, ...pages].filter((item) => {
      if (!term) return true;
      return `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(term);
    });

    const people: PaletteItem[] = results.people.map((person) => ({
      id: `person-${person.id}`,
      group: "People",
      label: person.name,
      hint: [person.designation, person.department].filter(Boolean).join(" · ") || person.email,
      icon: <Avatar name={person.name} seed={person.id} src={person.avatarUrl} size="sm" />,
      href: `/employees/${person.id}`,
    }));

    const reports: PaletteItem[] = results.reports.map((report) => ({
      id: `report-${report.id}`,
      group: "Status reports",
      label: `${report.author} — ${report.date}`,
      hint: report.excerpt,
      icon: <FileText className="size-4" />,
      href: `/dsr/${report.id}`,
    }));

    const departments: PaletteItem[] = results.departments.map((department) => ({
      id: `department-${department.id}`,
      group: "Departments",
      label: department.name,
      hint: `${department.memberCount} ${department.memberCount === 1 ? "member" : "members"}`,
      icon: <Building2 className="size-4" />,
      href: `/departments/${department.slug}`,
    }));

    const leave: PaletteItem[] = results.leave.map((request) => ({
      id: `leave-${request.id}`,
      group: "Leave requests",
      label: `${request.author} — ${request.type}`,
      hint: `${request.range} · ${request.status}`,
      icon: <Plane className="size-4" />,
      href: `/leave/${request.id}`,
    }));

    // Local matches first: they're exact and instant, so they should win.
    return [...local, ...people, ...reports, ...departments, ...leave].slice(0, 40);
  }, [query, role, results]);

  // Clamp the cursor whenever the result set shrinks.
  useEffect(() => {
    setActiveIndex((current) => (current >= items.length ? 0 : current));
  }, [items.length]);

  const select = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(1, items.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + items.length) % Math.max(1, items.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(items[activeIndex]);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    }
  };

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ item: PaletteItem; index: number }>>();
    items.forEach((item, index) => {
      const list = map.get(item.group) ?? [];
      list.push({ item, index });
      map.set(item.group, list);
    });
    return [...map.entries()];
  }, [items]);

  return (
    <>
      <CommandTrigger onClick={() => setOpen(true)} />

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh]">
              <div
                aria-hidden="true"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in"
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-label="Search and commands"
                className="animate-scale-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop"
              >
                <div className="flex items-center gap-2.5 border-b border-border px-4">
                  <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search people, reports, leave — or jump to a page…"
                    aria-label="Search"
                    aria-activedescendant={items[activeIndex] ? `palette-${items[activeIndex]!.id}` : undefined}
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
                  />
                  {loading ? <Spinner size={14} className="text-fg-subtle" /> : null}
                  <Kbd className="hidden sm:inline-flex">Esc</Kbd>
                </div>

                <div ref={listRef} className="max-h-[min(24rem,52vh)] overflow-y-auto overscroll-contain p-1.5">
                  {items.length === 0 ? (
                    <div className="px-3 py-10 text-center">
                      <p className="text-[13px] font-medium text-fg">No matches</p>
                      <p className="mt-1 text-[12.5px] text-fg-subtle">
                        {query.trim().length < 2
                          ? "Type at least two characters to search people and reports."
                          : `Nothing found for “${query.trim()}”.`}
                      </p>
                    </div>
                  ) : (
                    grouped.map(([group, entries]) => (
                      <div key={group} className="mb-1 last:mb-0">
                        <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-fg-subtle uppercase">
                          {group}
                        </div>
                        <ul role="listbox" aria-label={group}>
                          {entries.map(({ item, index }) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                id={`palette-${item.id}`}
                                data-index={index}
                                role="option"
                                aria-selected={index === activeIndex}
                                onMouseMove={() => setActiveIndex(index)}
                                onClick={() => select(item)}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                                  index === activeIndex ? "bg-surface-hover" : "bg-transparent",
                                )}
                              >
                                <span
                                  className={cn(
                                    "grid size-6 shrink-0 place-items-center text-fg-subtle",
                                    index === activeIndex && "text-fg",
                                  )}
                                >
                                  {item.icon}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-fg">
                                    {item.label}
                                  </span>
                                  {item.hint ? (
                                    <span className="block truncate text-[11.5px] text-fg-subtle">
                                      {item.hint}
                                    </span>
                                  ) : null}
                                </span>
                                {index === activeIndex ? (
                                  <CornerDownLeft
                                    className="size-3.5 shrink-0 text-fg-subtle"
                                    aria-hidden="true"
                                  />
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border bg-surface-inset px-4 py-2 text-[11px] text-fg-subtle">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Kbd>↑</Kbd>
                      <Kbd>↓</Kbd> navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <Kbd>↵</Kbd> open
                    </span>
                  </span>
                  <span className="hidden items-center gap-1 sm:flex">
                    <Users className="size-3" aria-hidden="true" />
                    Searches across the whole workspace
                  </span>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** The always-visible affordance in the top bar. */
function CommandTrigger({ onClick }: { onClick: () => void }) {
  const [isMac, setIsMac] = useState(false);

  // Platform detection has to happen after mount — the server can't know it, and
  // rendering the wrong modifier key then correcting it causes a hydration error.
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  return (
    <>
      {/* Desktop: a search-shaped button that reads as a field. */}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "hidden h-9 w-full max-w-[22rem] items-center gap-2 rounded-lg border border-border bg-surface px-3 sm:flex",
          "text-[13px] text-fg-subtle transition-[border-color,background-color] duration-150",
          "hover:border-border-strong hover:bg-surface-hover",
          "focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] outline-none",
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">Search or jump to…</span>
        <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>

      {/* Mobile: icon only. */}
      <button
        type="button"
        onClick={onClick}
        aria-label="Search"
        className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg sm:hidden"
      >
        <Search className="size-[18px]" />
      </button>
    </>
  );
}

/** Re-exported so pages can offer an inline "search everything" entry point. */
export function CommandHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-subtle">
      Press <Kbd>/</Kbd> to search
      <ArrowRight className="size-3" aria-hidden="true" />
    </span>
  );
}
