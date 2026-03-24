/* eslint-disable @typescript-eslint/no-explicit-any */

// In-memory cache: "USD:2026-03-15" → 1.0834
const rateCache = new Map<string, number>();

// 31 currencies supported in UI dropdown (EUR + 30 foreign)
export const SUPPORTED_CURRENCIES = [
  { code: "EUR", name: "Euro", flag: "\u{1F1EA}\u{1F1FA}" },
  { code: "USD", name: "D\u00f3lar estadounidense", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "GBP", name: "Libra esterlina", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "CHF", name: "Franco suizo", flag: "\u{1F1E8}\u{1F1ED}" },
  { code: "JPY", name: "Yen japon\u00e9s", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "CNY", name: "Yuan chino", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "SEK", name: "Corona sueca", flag: "\u{1F1F8}\u{1F1EA}" },
  { code: "DKK", name: "Corona danesa", flag: "\u{1F1E9}\u{1F1F0}" },
  { code: "NOK", name: "Corona noruega", flag: "\u{1F1F3}\u{1F1F4}" },
  { code: "PLN", name: "Zloty polaco", flag: "\u{1F1F5}\u{1F1F1}" },
  { code: "CZK", name: "Corona checa", flag: "\u{1F1E8}\u{1F1FF}" },
  { code: "HUF", name: "Forint h\u00fangaro", flag: "\u{1F1ED}\u{1F1FA}" },
  { code: "RON", name: "Leu rumano", flag: "\u{1F1F7}\u{1F1F4}" },
  { code: "BGN", name: "Lev b\u00falgaro", flag: "\u{1F1E7}\u{1F1EC}" },
  { code: "TRY", name: "Lira turca", flag: "\u{1F1F9}\u{1F1F7}" },
  { code: "MAD", name: "D\u00edrham marroqu\u00ed", flag: "\u{1F1F2}\u{1F1E6}" },
  { code: "ZAR", name: "Rand sudafricano", flag: "\u{1F1FF}\u{1F1E6}" },
  { code: "MXN", name: "Peso mexicano", flag: "\u{1F1F2}\u{1F1FD}" },
  { code: "BRL", name: "Real brasile\u00f1o", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "ARS", name: "Peso argentino", flag: "\u{1F1E6}\u{1F1F7}" },
  { code: "CLP", name: "Peso chileno", flag: "\u{1F1E8}\u{1F1F1}" },
  { code: "COP", name: "Peso colombiano", flag: "\u{1F1E8}\u{1F1F4}" },
  { code: "CAD", name: "D\u00f3lar canadiense", flag: "\u{1F1E8}\u{1F1E6}" },
  { code: "AUD", name: "D\u00f3lar australiano", flag: "\u{1F1E6}\u{1F1FA}" },
  { code: "NZD", name: "D\u00f3lar neozelands\u00e9s", flag: "\u{1F1F3}\u{1F1FF}" },
  { code: "SGD", name: "D\u00f3lar singapurense", flag: "\u{1F1F8}\u{1F1EC}" },
  { code: "HKD", name: "D\u00f3lar Hong Kong", flag: "\u{1F1ED}\u{1F1F0}" },
  { code: "KRW", name: "Won surcoreano", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "INR", name: "Rupia india", flag: "\u{1F1EE}\u{1F1F3}" },
  { code: "THB", name: "Baht tailand\u00e9s", flag: "\u{1F1F9}\u{1F1ED}" },
  { code: "ILS", name: "Shekel israel\u00ed", flag: "\u{1F1EE}\u{1F1F1}" },
] as const;

/**
 * Fetch exchange rate from ECB for a given currency and date.
 * Returns the rate as "1 EUR = X currency" (ECB convention).
 * Caches results per day.
 */
export async function fetchECBRate(currency: string, date: Date): Promise<number> {
  if (currency === "EUR") return 1;

  const dateStr = date.toISOString().slice(0, 10);
  const cacheKey = `${currency}:${dateStr}`;

  if (rateCache.has(cacheKey)) return rateCache.get(cacheKey)!;

  try {
    // ECB Statistical Data Warehouse API
    const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A?startPeriod=${dateStr}&endPeriod=${dateStr}&format=csvdata`;
    const response = await fetch(url);
    if (!response.ok) {
      // Fallback: try previous business day (weekends/holidays)
      const prevDay = new Date(date);
      prevDay.setDate(prevDay.getDate() - 1);
      return fetchECBRate(currency, prevDay);
    }
    const text = await response.text();
    // CSV format: headers, then data rows. Rate is in the OBS_VALUE column.
    const lines = text.trim().split("\n");
    if (lines.length < 2) throw new Error("No rate data from ECB");
    // Find OBS_VALUE column index from header
    const headers = lines[0].split(",");
    const obsIdx = headers.indexOf("OBS_VALUE");
    if (obsIdx === -1) throw new Error("OBS_VALUE column not found");
    const dataLine = lines[lines.length - 1].split(",");
    const rate = parseFloat(dataLine[obsIdx]);
    if (isNaN(rate) || rate <= 0) throw new Error("Invalid rate value");

    rateCache.set(cacheKey, rate);
    return rate;
  } catch {
    // If ECB fails, return 0 (caller should handle)
    console.warn(`[fx] Failed to fetch ECB rate for ${currency} on ${dateStr}`);
    return 0;
  }
}

/**
 * Convert an amount from a foreign currency to EUR.
 */
export async function convertToEUR(
  amount: number,
  currency: string,
  date: Date
): Promise<{ eurAmount: number; rate: number }> {
  if (currency === "EUR") return { eurAmount: amount, rate: 1 };
  const rate = await fetchECBRate(currency, date);
  if (rate === 0) return { eurAmount: amount, rate: 1 }; // fallback: treat as EUR
  return { eurAmount: Math.round((amount / rate) * 100) / 100, rate };
}

/**
 * Calculate FX difference between book rate and settlement rate.
 * Returns positive for gain (768), negative for loss (668).
 */
export function calculateFXDifference(
  originalAmount: number,
  bookRate: number,
  settlementRate: number
): { differenceEur: number; type: "GAIN" | "LOSS"; pgcAccount: string } {
  const bookEur = originalAmount / bookRate;
  const settlementEur = originalAmount / settlementRate;
  const diff = Math.round((settlementEur - bookEur) * 100) / 100;

  return {
    differenceEur: diff,
    type: diff >= 0 ? "GAIN" : "LOSS",
    pgcAccount: diff >= 0 ? "768" : "668",
  };
}
