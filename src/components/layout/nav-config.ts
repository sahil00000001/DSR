import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Megaphone,
  Plane,
  ScrollText,
  Settings,
  UserCheck,
  Users,
} from "lucide-react";
import type { Role } from "@/lib/constants/enums";

/**
 * Navigation is data, not markup.
 *
 * Declaring it once here means the sidebar, the mobile drawer, the bottom tab bar
 * and the command palette all show the same set of destinations with the same
 * role visibility — there's no second list to forget to update.
 */

/** Keys for the live counts the shell resolves server-side. */
export type BadgeKey = "pendingLeave" | "dsrToReview" | "openDsr" | "unreadNotifications";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that may see the item. Omitted = everyone. */
  roles?: Role[];
  badge?: BadgeKey;
  /** Match only this exact path (otherwise nested routes also highlight). */
  exact?: boolean;
  /** Extra terms for command-palette matching. */
  keywords?: string[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const MANAGEMENT: Role[] = ["ADMIN", "MANAGER"];
const ADMIN_ONLY: Role[] = ["ADMIN"];

const SECTIONS: NavSection[] = [
  {
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
        keywords: ["home", "overview", "today"],
      },
      {
        href: "/dsr",
        label: "My reports",
        icon: FileText,
        badge: "openDsr",
        exact: true,
        keywords: ["dsr", "daily status", "standup", "log"],
      },
      {
        href: "/attendance",
        label: "Attendance",
        icon: CalendarCheck,
        exact: true,
        keywords: ["present", "wfh", "check in"],
      },
      {
        href: "/leave",
        label: "Leave",
        icon: Plane,
        exact: true,
        keywords: ["holiday", "time off", "sick", "casual", "balance"],
      },
    ],
  },
  {
    label: "Team",
    items: [
      {
        href: "/dsr/review",
        label: "Report review",
        icon: ClipboardCheck,
        roles: MANAGEMENT,
        badge: "dsrToReview",
        keywords: ["dsr board", "bulk", "all reports"],
      },
      {
        href: "/attendance/board",
        label: "Attendance board",
        icon: UserCheck,
        roles: MANAGEMENT,
        keywords: ["who is in", "register", "roster"],
      },
      {
        href: "/leave/approvals",
        label: "Leave approvals",
        icon: Plane,
        roles: MANAGEMENT,
        badge: "pendingLeave",
        keywords: ["approve", "reject", "pending"],
      },
      {
        href: "/employees",
        label: "People",
        icon: Users,
        keywords: ["directory", "employees", "team", "contacts"],
      },
      {
        href: "/departments",
        label: "Departments",
        icon: Building2,
        keywords: ["teams", "org", "structure"],
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        href: "/analytics",
        label: "Analytics",
        icon: BarChart3,
        roles: MANAGEMENT,
        keywords: ["charts", "trends", "productivity", "insights"],
      },
      {
        href: "/reports",
        label: "Reports",
        icon: FileSpreadsheet,
        roles: MANAGEMENT,
        keywords: ["export", "csv", "excel", "pdf", "download"],
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/announcements",
        label: "Announcements",
        icon: Megaphone,
        keywords: ["news", "notice", "broadcast"],
      },
      {
        href: "/calendar",
        label: "Calendar",
        icon: CalendarDays,
        keywords: ["holidays", "birthdays", "who is off"],
      },
      {
        href: "/audit-log",
        label: "Audit log",
        icon: ScrollText,
        roles: ADMIN_ONLY,
        keywords: ["history", "activity", "trail", "security"],
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        keywords: ["profile", "password", "theme", "notifications", "preferences"],
      },
    ],
  },
];

/** Sections and items the given role may see, with empty sections dropped. */
export function navFor(role: Role): NavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

/** Flat list — used by the command palette. */
export function navItemsFor(role: Role): NavItem[] {
  return navFor(role).flatMap((section) => section.items);
}

/**
 * The four destinations pinned to the mobile bottom bar. Chosen as the things an
 * employee does *daily*; everything else lives behind "More".
 */
export function mobileTabsFor(role: Role): NavItem[] {
  const items = navItemsFor(role);
  const wanted = ["/dashboard", "/dsr", "/attendance", "/leave"];
  return wanted
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
}

/** True when `pathname` should highlight `item`. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
