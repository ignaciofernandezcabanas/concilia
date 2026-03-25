import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { detectBankFromIBAN } from "@/lib/bank/detect-bank";

/**
 * GET /api/bank-accounts/detect-bank?iban=ES...
 * Returns bankName and BIC for a given IBAN.
 */
export const GET = withAuth(async (req: NextRequest) => {
  const iban = req.nextUrl.searchParams.get("iban");
  if (!iban) {
    return NextResponse.json({ error: "Parámetro iban es obligatorio" }, { status: 400 });
  }

  const result = detectBankFromIBAN(iban);
  if (!result) {
    return NextResponse.json(
      { error: "No se pudo detectar el banco para este IBAN" },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}, "read:transactions");
