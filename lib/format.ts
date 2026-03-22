/**
 * Client-side formatting utilities (safe for "use client").
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

export function formatDate(date: string | Date, format: "short" | "long" | "iso" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (format === "iso") return d.toISOString().slice(0, 10);
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

export function getMonthRange(date: Date): { from: string; to: string } {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function getQuarterRange(date: Date): { from: string; to: string } {
  const q = Math.floor(date.getMonth() / 3);
  const from = new Date(date.getFullYear(), q * 3, 1);
  const to = new Date(date.getFullYear(), q * 3 + 3, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function getYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
