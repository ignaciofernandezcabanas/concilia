/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

/**
 * PUT /api/supporting-documents/[id]
 */
const updateSchema = z.object({
  description: z.string().optional(),
  reference: z.string().optional(),
  amount: z.number().positive().optional(),
  date: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  contactId: z.string().nullable().optional(),
});

export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const id = req.nextUrl.pathname.split("/").pop()!;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await (ctx.db as any).supportingDocument.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (existing.status === "RECONCILED") {
      return NextResponse.json({ error: "Cannot update a reconciled document" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.reference !== undefined) data.reference = parsed.data.reference;
    if (parsed.data.amount !== undefined) data.amount = parsed.data.amount;
    if (parsed.data.date !== undefined) data.date = new Date(parsed.data.date);
    if (parsed.data.fileUrl !== undefined) data.fileUrl = parsed.data.fileUrl;
    if (parsed.data.fileName !== undefined) data.fileName = parsed.data.fileName;
    if (parsed.data.contactId !== undefined) data.contactId = parsed.data.contactId;

    const updated = await (ctx.db as any).supportingDocument.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse("Failed to update supporting document", err);
  }
}, "resolve:reconciliation");

/**
 * DELETE /api/supporting-documents/[id]
 */
export const DELETE = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const id = req.nextUrl.pathname.split("/").pop()!;

    const existing = await (ctx.db as any).supportingDocument.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const updated = await (ctx.db as any).supportingDocument.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse("Failed to cancel supporting document", err);
  }
}, "resolve:reconciliation");
