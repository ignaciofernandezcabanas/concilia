import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

/**
 * GET /api/inquiries — List inquiries with filters
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const triggerType = sp.get("triggerType");
    const contactId = sp.get("contactId");
    const page = parseInt(sp.get("page") ?? "1");
    const pageSize = parseInt(sp.get("pageSize") ?? "25");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (triggerType) where.triggerType = triggerType;
    if (contactId) where.contactId = contactId;

    const [data, total] = await Promise.all([
      db.inquiry.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, email: true, accountingEmail: true } },
          bankTransaction: {
            select: {
              id: true,
              amount: true,
              concept: true,
              valueDate: true,
              counterpartName: true,
            },
          },
          invoice: { select: { id: true, number: true, totalAmount: true, type: true } },
          parentInquiry: { select: { id: true, subject: true, sentAt: true } },
          followUps: { select: { id: true, status: true, followUpNumber: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.inquiry.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    return errorResponse("Failed to list inquiries", err);
  }
});

const createSchema = z.object({
  triggerType: z.enum([
    "MISSING_INVOICE",
    "MISSING_DOCUMENTATION",
    "EXPENSE_CLARIFICATION",
    "IC_CONFIRMATION",
  ]),
  bankTransactionId: z.string().optional(),
  reconciliationId: z.string().optional(),
  invoiceId: z.string().optional(),
  contactId: z.string(),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  bodyPlain: z.string().min(1),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "FORMAL", "URGENT"]).default("PROFESSIONAL"),
  language: z.string().default("es"),
});

/**
 * POST /api/inquiries — Create inquiry manually
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const inquiry = await (db.inquiry as any).create({
      data: { ...parsed.data, status: "DRAFT" },
    });

    return NextResponse.json(inquiry, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create inquiry", err);
  }
});
