import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";

/**
 * GET /api/settings/accounts
 * Returns active PGC accounts for the company. Used by AccountPicker.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const search = req.nextUrl.searchParams.get("search") ?? "";

  const accounts = await prisma.account.findMany({
    where: {
      companyId: ctx.company.id,
      isActive: true,
      ...(search ? {
        OR: [
          { code: { contains: search } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
    },
    select: { code: true, name: true, group: true, pygLine: true, cashflowType: true },
    orderBy: { code: "asc" },
    take: 50,
  });

  return NextResponse.json({ accounts });
}, "read:dashboard");
