"use client";

import { useTransition } from "react";
import { CircleUser, LifeBuoy, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  MenuHeader,
  MenuItem,
  MenuLink,
  MenuSeparator,
} from "@/components/ui/dropdown-menu";
import { usePopover } from "@/components/ui/popover";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { signOutAction } from "@/server/actions/auth";
import { ROLE_LABEL, type Role } from "@/lib/constants/enums";

interface UserMenuProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    avatarUrl: string | null;
    employeeCode: string;
    departmentName: string | null;
  };
}

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function UserMenu({ user }: UserMenuProps) {
  const { open, triggerProps, panelProps } = usePopover({ role: "menu" });
  const { theme, setTheme } = useTheme();
  const [isSigningOut, startSignOut] = useTransition();

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label={`Account menu for ${user.name}`}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg transition-colors outline-none",
          "hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
          open && "bg-surface-hover",
        )}
      >
        <Avatar name={user.name} seed={user.id} src={user.avatarUrl} size="md" />
      </button>

      <DropdownMenu {...panelProps} align="end" className="w-[15.5rem]">
        <MenuHeader>
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} seed={user.id} src={user.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-fg">{user.name}</p>
              <p className="truncate text-[11.5px] text-fg-subtle">{user.email}</p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={user.role === "ADMIN" ? "accent" : "neutral"} size="sm">
              {ROLE_LABEL[user.role]}
            </Badge>
            <Badge tone="neutral" size="sm" variant="outline">
              {user.employeeCode}
            </Badge>
          </div>
        </MenuHeader>

        <MenuLink href={`/employees/${user.id}`}>
          <CircleUser />
          My profile
        </MenuLink>
        <MenuLink href="/settings">
          <Settings />
          Settings
        </MenuLink>

        <MenuSeparator />

        {/* Theme lives in the menu as well as the top bar: it's the first place
            people look for it, and the top-bar toggle is icon-only. */}
        <div className="px-2.5 pt-1 pb-2">
          <p className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-fg-subtle uppercase">
            Appearance
          </p>
          <div
            role="radiogroup"
            aria-label="Colour theme"
            className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5"
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex h-6 flex-1 items-center justify-center gap-1 rounded-[6px] text-[11.5px] font-medium transition-all",
                    active ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-3" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <MenuSeparator />

        <MenuLink href="/help">
          <LifeBuoy />
          Help &amp; shortcuts
        </MenuLink>

        <MenuItem
          tone="danger"
          onClick={() => startSignOut(() => void signOutAction())}
          disabled={isSigningOut}
        >
          <LogOut />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </MenuItem>
      </DropdownMenu>
    </>
  );
}
