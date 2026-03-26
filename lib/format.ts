/**
 * Client-side formatting utilities (safe for "use client").
 */

/**
 * Format a monetary amount with currency symbol.
 * Negatives shown in parentheses per financial convention: (1.234,56 €)
 */
export function formatAmount(amount: number, currency = "EUR"): string {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  const symbol = currency === "EUR" ? "€" : currency;
  const str = `${formatted} ${symbol}`;
  return isNegative ? `(${str})` : str;
}

/**
 * Format a number without currency. Negatives in parentheses.
 * Use for table cells where the € symbol is in the header.
 */
export function formatNumber(val: number): string {
  if (val === 0) return "0,00";
  const abs = Math.abs(val);
  const s = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return val < 0 ? `(${s})` : s;
}

export function formatDate(
  date: string | Date,
  format: "short" | "long" | "iso" = "short"
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (format === "iso") return localDateStr(d);
  if (format === "long") {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(date);
}

/**
 * Capitalized period label for month selectors: "Marzo de 2026"
 * Use this instead of formatMonth() when rendering period navigator labels.
 */
export function formatPeriodLabel(date: Date): string {
  const raw = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Table date format: "28/02/2026"
 * Use for date cells in data tables.
 */
export function formatTableDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Format a local Date as YYYY-MM-DD without UTC conversion */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Relative date with absolute tooltip.
 * Returns { relative: "Hoy"|"Ayer"|"5d", absolute: "26/03/2026" }
 */
export function formatRelativeWithTitle(date: string | Date): {
  relative: string;
  absolute: string;
} {
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const relative = days === 0 ? "Hoy" : days === 1 ? "Ayer" : `${days}d`;
  const absolute = formatTableDate(d);
  return { relative, absolute };
}

export function getMonthRange(date: Date): { from: string; to: string } {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: localDateStr(from), to: localDateStr(to) };
}

export function getQuarterRange(date: Date): { from: string; to: string } {
  const q = Math.floor(date.getMonth() / 3);
  const from = new Date(date.getFullYear(), q * 3, 1);
  const to = new Date(date.getFullYear(), q * 3 + 3, 0);
  return { from: localDateStr(from), to: localDateStr(to) };
}

export function getYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
