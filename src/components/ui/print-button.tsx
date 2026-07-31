"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Print / save-as-PDF.
 *
 * PDF export is handled by the browser's own print pipeline rather than a
 * server-side renderer. That's a deliberate trade for this product:
 *
 *   • zero dependencies and zero cold-start cost on Vercel (a headless Chromium
 *     is ~50 MB and pushes a serverless function past its limit);
 *   • the output honours the user's theme, locale and page size;
 *   • one print stylesheet (see the `@media print` block in globals.css) styles
 *     every report, table and dashboard consistently.
 *
 * Structured exports that need to be machine-readable go through CSV/XLSX
 * instead — see /api/export.
 */
export function PrintButton({
  label = "Print",
  variant = "secondary",
  size = "sm",
}: {
  label?: string;
  variant?: "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
}) {
  return (
    <Button variant={variant} size={size} onClick={() => window.print()} data-print="hide">
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
