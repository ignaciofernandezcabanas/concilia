/**
 * Data export utilities — Excel (xlsx) and CSV.
 *
 * Uses exceljs for xlsx generation. Formats numbers according to EU/US conventions.
 * Includes metadata (view name, applied filters, export timestamp).
 */

import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NumberFormat = "eu" | "us";

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  /** "number" columns get formatted; default is "string" */
  type?: "string" | "number" | "date";
}

export interface ExportOptions {
  /** Name of the view/report being exported */
  viewName: string;
  /** Human-readable description of applied filters */
  filters?: Record<string, string>;
  /** Number format: EU (1.234,56) or US (1,234.56) */
  numberFormat?: NumberFormat;
  /** Currency symbol for amount columns */
  currency?: string;
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export async function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  options: ExportOptions
): Promise<Buffer> {
  const { viewName, filters, numberFormat = "eu", currency = "EUR" } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Concilia";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(viewName.slice(0, 31)); // Excel tab names max 31 chars

  // --- Metadata rows ---
  const metaStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 10, color: { argb: "FF555555" } },
  };

  let currentRow = 1;

  // Title
  sheet.getCell(`A${currentRow}`).value = viewName;
  sheet.getCell(`A${currentRow}`).style = {
    font: { bold: true, size: 14 },
  };
  currentRow += 1;

  // Export date
  sheet.getCell(`A${currentRow}`).value =
    `Exportado: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  sheet.getCell(`A${currentRow}`).style = metaStyle;
  currentRow += 1;

  // Filters
  if (filters && Object.keys(filters).length > 0) {
    sheet.getCell(`A${currentRow}`).value = "Filtros aplicados:";
    sheet.getCell(`A${currentRow}`).style = metaStyle;
    currentRow += 1;

    for (const [key, value] of Object.entries(filters)) {
      sheet.getCell(`A${currentRow}`).value = `  ${key}: ${value}`;
      sheet.getCell(`A${currentRow}`).style = {
        font: { size: 10, color: { argb: "FF777777" } },
      };
      currentRow += 1;
    }
  }

  // Blank separator row
  currentRow += 1;

  // --- Header row ---
  const headerRow = sheet.getRow(currentRow);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.style = {
      font: { bold: true, size: 11, color: { argb: "FFFFFFFF" } },
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      },
      alignment: { horizontal: col.type === "number" ? "right" : "left" },
      border: {
        bottom: { style: "thin", color: { argb: "FF1D4ED8" } },
      },
    };
  });
  headerRow.commit();
  currentRow += 1;

  // --- Data rows ---
  const excelNumberFormat = numberFormat === "eu" ? "#.##0,00" : "#,##0.00";

  for (const record of data) {
    const row = sheet.getRow(currentRow);

    columns.forEach((col, idx) => {
      const cell = row.getCell(idx + 1);
      const rawValue = record[col.key];

      if (col.type === "number" && typeof rawValue === "number") {
        cell.value = rawValue;
        cell.numFmt = excelNumberFormat;
        cell.alignment = { horizontal: "right" };
      } else if (col.type === "date" && rawValue instanceof Date) {
        cell.value = rawValue;
        cell.numFmt = "DD/MM/YYYY";
      } else if (col.type === "date" && typeof rawValue === "string") {
        cell.value = rawValue;
      } else {
        cell.value = rawValue != null ? String(rawValue) : "";
      }
    });

    row.commit();
    currentRow += 1;
  }

  // Set column widths
  columns.forEach((col, idx) => {
    const excelCol = sheet.getColumn(idx + 1);
    excelCol.width = col.width ?? 18;
  });

  // Auto-filter on the header row
  const headerRowNum = currentRow - data.length - 1;
  sheet.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: headerRowNum, column: columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export function exportToCsv(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  options: ExportOptions & { separator?: string }
): string {
  const { viewName, filters, numberFormat = "eu", separator = ";" } = options;

  const lines: string[] = [];

  // Metadata header
  lines.push(`${escapeCsvField(viewName, separator)}`);
  lines.push(`Exportado: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);

  if (filters && Object.keys(filters).length > 0) {
    lines.push("Filtros aplicados:");
    for (const [key, value] of Object.entries(filters)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  lines.push(""); // blank separator

  // Header row
  lines.push(columns.map((col) => escapeCsvField(col.header, separator)).join(separator));

  // Data rows
  for (const record of data) {
    const cells = columns.map((col) => {
      const rawValue = record[col.key];

      if (col.type === "number" && typeof rawValue === "number") {
        return formatNumberForCsv(rawValue, numberFormat);
      }

      if (rawValue == null) return "";
      return escapeCsvField(String(rawValue), separator);
    });

    lines.push(cells.join(separator));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeCsvField(value: string, separator: string): string {
  // Wrap in quotes if the value contains the separator, quotes, or newlines
  if (
    value.includes(separator) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatNumberForCsv(value: number, format: NumberFormat): string {
  const fixed = value.toFixed(2);

  if (format === "eu") {
    // 1234.56 → "1234,56" (in CSV, the decimal separator is comma)
    // The thousands separator is a dot, but we omit it in CSV to avoid
    // confusion with the field separator.
    return fixed.replace(".", ",");
  }

  // US: keep as-is (dot decimal separator)
  return fixed;
}
