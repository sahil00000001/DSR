import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { buildDataset, type ExportKind } from "@/lib/export/datasets";
import { downloadHeaders, exportFilename, toCsv } from "@/lib/export/csv";
import { toXlsx, XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { dsrFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/services/audit";

/**
 * Data export.
 *
 * One route for every dataset and both formats. Points worth noting:
 *
 *  • **Authorisation first.** Exports are the easiest way to exfiltrate a whole
 *    table, so the permission check happens before anything is read, and the
 *    dataset builders take the `Actor` and apply the same row scoping the UI does.
 *  • **Audited.** Every download writes an audit entry with the kind and row count.
 *  • **Node runtime.** The XLSX writer uses `node:zlib`, which the Edge runtime
 *    doesn't provide.
 */
export const runtime = "nodejs";

const VALID_KINDS: ExportKind[] = [
  "dsr",
  "attendance",
  "leave",
  "employees",
  "departments",
  "dsr-completion",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (!can.exportData(user)) {
    return NextResponse.json(
      { error: "Exports are available to managers and admins." },
      { status: 403 },
    );
  }

  const { kind: rawKind } = await params;
  if (!VALID_KINDS.includes(rawKind as ExportKind)) {
    return NextResponse.json({ error: `Unknown export: ${rawKind}` }, { status: 404 });
  }
  const kind = rawKind as ExportKind;

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  try {
    // DSR-shaped filters are reused across datasets; unrelated keys are ignored.
    const filters = parseSearchParams(
      dsrFilterSchema,
      Object.fromEntries(searchParams.entries()),
    );

    const dataset = await buildDataset(kind, user, searchParams, filters);

    await recordAudit({
      actorId: user.id,
      action: "export.download",
      entity: kind,
      meta: { format, rows: dataset.rows.length, query: searchParams.toString().slice(0, 300) },
    });

    if (format === "xlsx") {
      const buffer = toXlsx(dataset.rows, dataset.columns, { sheetName: dataset.sheetName });
      const filename = exportFilename(dataset.filename, "xlsx");

      // Uint8Array satisfies BodyInit; Buffer is a subclass of it.
      return new NextResponse(new Uint8Array(buffer), {
        headers: downloadHeaders(filename, XLSX_CONTENT_TYPE),
      });
    }

    const csv = toCsv(dataset.rows, dataset.columns);
    const filename = exportFilename(dataset.filename, "csv");

    return new NextResponse(csv, {
      headers: downloadHeaders(filename, "text/csv; charset=utf-8"),
    });
  } catch (error) {
    logger.error("Export failed", error, { kind, format, userId: user.id });
    return NextResponse.json(
      { error: "That export couldn't be generated. Please try a narrower date range." },
      { status: 500 },
    );
  }
}
