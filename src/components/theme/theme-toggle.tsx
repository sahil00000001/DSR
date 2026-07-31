"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { SegmentedControl } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const OPTIONS: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "System", icon: <Monitor /> },
];

/** Three-way picker for the settings screen. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <SegmentedControl
      label="Colour theme"
      value={theme}
      onChange={setTheme}
      options={OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        icon: option.icon,
      }))}
    />
  );
}

/**
 * Compact toggle for the top bar.
 * Cycles light → dark → system so the whole range stays reachable in one control.
 */
export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();

  const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label =
    theme === "system" ? `System theme (currently ${resolved})` : `${theme === "light" ? "Light" : "Dark"} theme`;

  return (
    <Tooltip content={`${label} — switch to ${next}`}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setTheme(next)}
        aria-label={`${label}. Switch to ${next} theme.`}
      >
        {theme === "system" ? (
          <Monitor className="size-4" />
        ) : theme === "dark" ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
      </Button>
    </Tooltip>
  );
}
