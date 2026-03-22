import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { transactionFiltersSchema } from "@/lib/utils/validation";
import { paginatedResponse } from "@/lib/utils/pagination";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/transactions
 *
 * Lists bank transactions with filtering, search, sorting, and pagination.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;
    const searchParams = req.nextUrl.searchParams;

    const parsed = transactionFiltersSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const filters = parsed.data;

    // Build where clause
    const where: Prisma.BankTransactionWhereInput = {
      companyId: company.id,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.detectedType) {
      where.detectedType = filters.detectedType;
    }

    if (filters.from || filters.to) {
      where.valueDate = {};
      if (filters.from) where.valueDate.gte = filters.from;
      if (filters.to) where.valueDate.lte = filters.to;
    }

    if (filters.minAmount != null || filters.maxAmount != null) {
      where.amount = {};
      if (filters.minAmount != null) where.amount.gte = filters.minAmount;
      if (filters.maxAmount != null) where.amount.lte = filters.maxAmount;
    }

    if (filters.counterpartIban) {
      where.counterpartIban = {
        contains: filters.counterpartIban.replace(/\s/g, ""),
        mode: "insensitive",
      };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { concept: { contains: search, mode: "insensitive" } },
        { counterpartName: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: {
          classification: {
            include: {
              account: { select: { code: true, name: true } },
            },
          },
          _count: {
            select: { reconciliations: true },
          },
        },
        orderBy: { [filters.sortBy]: filters.sortOrder },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    return NextResponse.json(
      paginatedResponse(data, total, filters.page, filters.pageSize)
    );
  },
  "read:transactions"
);
