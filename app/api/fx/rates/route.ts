import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { fetchECBRate, SUPPORTED_CURRENCIES } from "@/lib/fx/exchange-rate";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * GET /api/fx/rates?currency=USD&date=2026-03-15
 *
 * Returns the ECB exchange rate for a currency on a given date.
 * Rate is expressed as "1 EUR = X currency" (ECB convention).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const GET = withAuth(async (req: NextRequest, _ctx: AuthContext) => {
  try {
    const url = req.nextUrl;
    const currency = url.searchParams.get("currency")?.toUpperCase();
    const dateStr = url.searchParams.get("date");

    if (!currency) {
      return NextResponse.json(
        { error: 'Query parameter "currency" is required.' },
        { status: 400 }
      );
    }

    const validCodes = SUPPORTED_CURRENCIES.map((c) => c.code);
    if (!validCodes.includes(currency as (typeof SUPPORTED_CURRENCIES)[number]["code"])) {
      return NextResponse.json(
        { error: `Unsupported currency: ${currency}. Supported: ${validCodes.join(", ")}` },
        { status: 400 }
      );
    }

    const date = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }

    const rate = await fetchECBRate(currency, date);

    if (rate === 0) {
      return NextResponse.json(
        { error: `Could not fetch rate for ${currency} on ${date.toISOString().slice(0, 10)}` },
        { status: 502 }
      );
    }

    const eurEquivalent = rate !== 0 ? Math.round((1 / rate) * 10000) / 10000 : 0;

    return NextResponse.json({
      currency,
      date: date.toISOString().slice(0, 10),
      rate,
      eurEquivalent,
    });
  } catch (err) {
    return errorResponse("Failed to fetch exchange rate", err);
  }
});
