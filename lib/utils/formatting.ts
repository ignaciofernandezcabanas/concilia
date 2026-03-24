/**
 * Financial formatting utilities for the Spanish/EU market.
 */

type NumberFormat = "eu" | "us";
type DateFormat = "short" | "long" | "iso";

const EU_LOCALE = "es-ES";
const US_LOCALE = "en-US";

/**
 * Format a monetary amount.
 *
 * - EU (default): "1.234,56 EUR" / negative: "(1.234,56 EUR)"
 * - US: "1,234.56 EUR" / negative: "(1,234.56 EUR)"
 */
export function formatAmount(
  amount: number,
  format: NumberFormat = "eu",
  currency: string = "EUR"
): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const locale = format === "eu" ? EU_LOCALE : US_LOCALE;

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount);

  const symbol = currency === "EUR" ? "\u20AC" : currency;
  const withCurrency = `${formatted} ${symbol}`;

  return isNegative ? `(${withCurrency})` : withCurrency;
}

/**
 * Format a date value.
 *
 * - "short" (default): "15 Mar 2026"
 * - "long": "15 de marzo de 2026"
 * - "iso": "2026-03-15"
 */
export function formatDate(date: Date | string, format: DateFormat = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;

  if (format === "iso") {
    return d.toISOString().slice(0, 10);
  }

  if (format === "long") {
    return new Intl.DateTimeFormat(EU_LOCALE, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }

  // "short" — "15 Mar 2026"
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Format an IBAN for display.
 *
 * - masked (default): "ES12 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 7890"
 * - unmasked: "ES12 3456 7890 1234 5678 9012"
 */
export function formatIban(iban: string, masked: boolean = true): string {
  // Strip all whitespace
  const clean = iban.replace(/\s/g, "");

  if (!masked) {
    // Group in blocks of 4
    return clean.replace(/(.{4})/g, "$1 ").trim();
  }

  if (clean.length < 8) {
    return clean;
  }

  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  const middleBlocks = Math.max(0, Math.ceil((clean.length - 8) / 4));
  const maskedMiddle = Array(middleBlocks).fill("\u2022\u2022\u2022\u2022").join(" ");

  return `${prefix} ${maskedMiddle} ${suffix}`.replace(/\s+/g, " ").trim();
}

/**
 * Format a PGC (Plan General Contable) account label.
 *
 * Example: pgcAccountLabel("629", "Otros servicios") => "629 - Otros servicios"
 */
export function pgcAccountLabel(code: string, name: string): string {
  return `${code} - ${name}`;
}
