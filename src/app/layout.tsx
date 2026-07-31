import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

import { ThemeProvider, ThemeScript, THEME_COOKIE, type Theme } from "@/components/theme/theme-provider";
import { AppProviders } from "@/app/providers";

export const metadata: Metadata = {
  // A template means every page contributes its own name without repeating the brand.
  title: {
    default: "Cadence — Team Operations",
    template: "%s · Cadence",
  },
  description:
    "Cadence is the operating rhythm for your team: daily status reports, attendance, leave and analytics in one place.",
  applicationName: "Cadence",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  appleWebApp: {
    capable: true,
    title: "Cadence",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // Internal tool: keep it out of search indexes.
  robots: { index: false, follow: false },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom must stay available — capping it fails WCAG 1.4.4.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121418" },
  ],
  // Let the app paint under the notch on iOS when installed.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the persisted theme server-side so the correct class is in the initial
  // HTML. `ThemeScript` then resolves "system" before paint.
  const cookieStore = await cookies();
  const stored = cookieStore.get(THEME_COOKIE)?.value;
  const theme: Theme = stored === "light" || stored === "dark" ? stored : "system";

  return (
    <html
      lang="en"
      // `suppressHydrationWarning` is required and correct here: ThemeScript
      // mutates this element's class before React hydrates, so server and client
      // markup legitimately differ on this one attribute.
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${theme === "dark" ? "dark" : ""}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-fg antialiased">
        {/* First stop for keyboard users; targets the <main> in the app shell. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3.5 focus:py-2 focus:text-[13px] focus:font-medium focus:text-accent-fg focus:shadow-lg"
        >
          Skip to main content
        </a>

        <ThemeProvider initialTheme={theme}>
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
