import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";

/**
 * GET /api/search
 *
 * Global search across invoices, bank transactions, and contacts.
 *
 * Query params:
 *   q    - Search query (min 2 characters)
 *   limit - Max results per entity type (default: 5)
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;
    const query = req.nextUrl.searchParams.get("q")?.trim();
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10) || 5,
      20
    );

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "Query parameter 'q' must be at least 2 characters." },
        { status: 400 }
      );
    }

    // Run all searches in parallel
    const [invoices, transactions, contacts] = await Promise.all([
      // Search invoices by number, description, or contact name
      prisma.invoice.findMany({
        where: {
          companyId: company.id,
          OR: [
            { number: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            {
              contact: {
                name: { contains: query, mode: "insensitive" },
              },
            },
          ],
        },
        select: {
          id: true,
          number: true,
          type: true,
          issueDate: true,
          totalAmount: true,
          status: true,
          description: true,
          contact: { select: { name: true } },
        },
        orderBy: { issueDate: "desc" },
        take: limit,
      }),

      // Search bank transactions by concept, counterpart name, or reference
      prisma.bankTransaction.findMany({
        where: {
          companyId: company.id,
          status: { notIn: ["DUPLICATE", "IGNORED"] },
          OR: [
            { concept: { contains: query, mode: "insensitive" } },
            { counterpartName: { contains: query, mode: "insensitive" } },
            { reference: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          valueDate: true,
          amount: true,
          concept: true,
          counterpartName: true,
          status: true,
        },
        orderBy: { valueDate: "desc" },
        take: limit,
      }),

      // Search contacts by name or CIF
      prisma.contact.findMany({
        where: {
          companyId: company.id,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { cif: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          cif: true,
          type: true,
          _count: { select: { invoices: true } },
        },
        take: limit,
      }),
    ]);

    return NextResponse.json({
      query,
      results: {
        invoices: invoices.map((inv) => ({
          ...inv,
          _type: "invoice" as const,
        })),
        transactions: transactions.map((tx) => ({
          ...tx,
          _type: "transaction" as const,
        })),
        contacts: contacts.map((c) => ({
          ...c,
          _type: "contact" as const,
        })),
      },
      totalResults: invoices.length + transactions.length + contacts.length,
    });
  },
  "read:dashboard"
);
