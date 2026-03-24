import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { invoiceFiltersSchema } from "@/lib/utils/validation";
import { paginatedResponse } from "@/lib/utils/pagination";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/invoices
 *
 * Lists invoices with filtering, search, sorting, and pagination.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const { company } = ctx;
  const searchParams = req.nextUrl.searchParams;

  const parsed = invoiceFiltersSchema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const filters = parsed.data;

  // Build where clause
  const where: Prisma.InvoiceWhereInput = {
    companyId: company.id,
  };

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.contactId) {
    where.contactId = filters.contactId;
  }

  if (filters.from || filters.to) {
    where.issueDate = {};
    if (filters.from) where.issueDate.gte = filters.from;
    if (filters.to) where.issueDate.lte = filters.to;
  }

  if (filters.search) {
    const search = filters.search.trim();
    where.OR = [
      { number: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      {
        contact: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  const [data, total] = await Promise.all([
    db.invoice.findMany({
      where,
      include: {
        contact: {
          select: { id: true, name: true, cif: true },
        },
        _count: {
          select: { reconciliations: true, payments: true },
        },
      },
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.invoice.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(data, total, filters.page, filters.pageSize));
}, "read:invoices");
