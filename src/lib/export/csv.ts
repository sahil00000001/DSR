import "server-only";

/**
 * CSV generation (RFC 4180).
 *
 * Two details that matter in practice:
 *
 *  • **UTF-8 BOM.** Without it, Excel on Windows opens the file in the local
 *    ANSI codepage and mangles every non-ASCII name. One three-byte prefix is the
 *    difference between "Zoë Rodrigues" and "ZoÃ« Rodrigues".
 *  • **Formula injection defence.** A cell starting `=`, `+`, `-`, `@`, tab or CR
 *    is executed as a formula when the file is opened. Since these exports contain
 *    user-authored text, such values are prefixed with a single quote so the
 *    spreadsheet treats them as literal text.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

const RISKY_PREFIX = /^[=+\-@\t\r]/;

function formatValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    // ISO day format sorts correctly and is unambiguous across locales.
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  return value;
}

function escapeCell(raw: string): string {
  // Neutralise a leading character a spreadsheet would treat as a formula.
  const guarded = RISKY_PREFIX.test(raw) ? `'${raw}` : raw;

  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv<T>(rows: readonly T[], columns: Array<CsvColumn<T>>): string {
  const lines: string[] = [columns.map((column) => escapeCell(column.header)).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(formatValue(column.value(row)))).join(","));
  }

  // CRLF is what RFC 4180 specifies and what Excel expects.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Filesystem- and header-safe filename with a date stamp. */
export function exportFilename(kind: string, extension: string, stamp = new Date()): string {
  const date = stamp.toISOString().slice(0, 10);
  const safe = kind.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return `cadence-${safe}-${date}.${extension}`;
}

/** Response headers that make a browser download rather than render the file. */
export function downloadHeaders(filename: string, contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    // The quoted filename covers legacy clients; filename* carries UTF-8.
    "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store",
  };
}
