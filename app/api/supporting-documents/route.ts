/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { registerSupportingDocument } from "@/lib/accounting/supporting-docs";
import { z } from "zod";

/**
 * GET /api/supporting-documents?status=REGISTERED&type=ACTA_JUNTA&from=...&to=...
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;
    const url = req.nextUrl;
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [data, total, countsByStatus] = await Promise.all([
      (db as any).supportingDocument.findMany({
        where,
        include: {
          contact: { select: { name: true, cif: true } },
          journalEntry: { select: { id: true, number: true, status: true } },
        },
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      (db as any).supportingDocument.count({ where }),
      (db as any).supportingDocument.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of countsByStatus) {
      counts[row.status] = row._count.status;
    }

    return NextResponse.json({ data, total, page, limit, counts });
  } catch (err) {
    return errorResponse("Failed to fetch supporting documents", err);
  }
}, "read:reports");

/**
 * POST /api/supporting-documents
 */
const createSchema = z.object({
  type: z.string(),
  reference: z.string().optional(),
  description: z.string().min(1),
  date: z.string(),
  amount: z.number().positive(),
  contactId: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  debitAccountCode: z.string().optional(),
  creditAccountCode: z.string().optional(),
  cashflowType: z.string().optional(),
  expectedDirection: z.string().optional(),
  expectedAmount: z.number().optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await registerSupportingDocument(ctx.db, {
      ...parsed.data,
      date: new Date(parsed.data.date),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create supporting document", err);
  }
}, "resolve:reconciliation");
