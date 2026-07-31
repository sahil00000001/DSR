"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  /** The user's preference, including "system". */
  theme: Theme;
  /** What's actually on screen right now. */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_COOKIE = "pmpl_theme";
/** One year — long enough that the preference feels permanent. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Theme state.
 *
 * The initial theme is applied by a blocking inline script in the document head
 * (see `ThemeScript`), *before* first paint — so there's no flash of the wrong
 * theme. This provider owns changes after hydration.
 *
 * The preference is persisted in a cookie rather than localStorage because the
 * server needs to read it to render the right `class` on `<html>`; localStorage
 * is invisible to the server and would guarantee a flash.
 */
export function ThemeProvider({
  children,
  initialTheme = "system",
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [resolved, setResolved] = useState<"light" | "dark">(
    initialTheme === "dark" ? "dark" : "light",
  );

  const apply = useCallback((next: Theme) => {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const effective = next === "system" ? (prefersDark ? "dark" : "light") : next;

    document.documentElement.classList.toggle("dark", effective === "dark");
    // Keep the native UI (scrollbars, form controls) in step with the theme.
    document.documentElement.style.colorScheme = effective;
    setResolved(effective);
  }, []);

  // Sync on mount so a cookie-less first visit resolves "system" correctly.
  useEffect(() => {
    apply(theme);
  }, [theme, apply]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme, apply]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      apply(next);
      // `SameSite=Lax` is enough: this is a display preference, not a credential.
      document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
    },
    [apply],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return context;
}

/**
 * Blocking script that sets the theme class before the first paint.
 *
 * This is the one place `dangerouslySetInnerHTML` is correct: the content is a
 * fixed literal with no interpolation, and it must execute synchronously in the
 * head. Any async alternative (an effect, a deferred script) paints the wrong
 * theme first and flashes.
 */
export function ThemeScript() {
  const script = `
(function(){try{
  var m=document.cookie.match(/(?:^|; )pmpl_theme=([^;]+)/);
  var t=m?decodeURIComponent(m[1]):"system";
  var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  if(d)document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme=d?"dark":"light";
}catch(e){}})();`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
