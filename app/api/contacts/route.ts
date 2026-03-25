/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { parsePagination, paginatedResponse } from "@/lib/utils/pagination";
import { normalizeNif } from "@/lib/contacts/utils";

/**
 * GET /api/contacts
 *
 * Lists contacts with filtering, search, and pagination.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const search = sp.get("search");
    const { page, pageSize, skip, take } = parsePagination(sp);

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { cif: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      db.contact.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
        include: {
          _count: { select: { invoices: true } },
        },
      }),
      db.contact.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(data, total, page, pageSize));
  } catch (err) {
    return errorResponse("Error al listar contactos", err);
  }
});

const createContactSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  cif: z.string().optional().nullable(),
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]),
  email: z.string().email().optional().nullable(),
  iban: z.string().optional().nullable(),
  accountingEmail: z.string().email().optional().nullable(),
  accountingContact: z.string().optional().nullable(),
  paymentTermsDays: z.number().int().min(0).optional().nullable(),
  preferredLanguage: z.string().optional().nullable(),
});

/**
 * POST /api/contacts
 *
 * Creates a new contact.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const cif = normalizeNif(data.cif ?? null);

    // Check duplicate CIF within company
    if (cif) {
      const existing = await db.contact.findFirst({ where: { cif } });
      if (existing) {
        return NextResponse.json(
          { error: `Ya existe un contacto con CIF ${cif}` },
          { status: 409 }
        );
      }
    }

    const contact = await db.contact.create({
      data: {
        name: data.name,
        cif,
        type: data.type,
        email: data.email ?? null,
        iban: data.iban ?? null,
        accountingEmail: data.accountingEmail ?? null,
        accountingContact: data.accountingContact ?? null,
        paymentTermsDays: data.paymentTermsDays ?? null,
        preferredLanguage: data.preferredLanguage ?? "es",
        companyId: ctx.company.id,
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (err) {
    return errorResponse("Error al crear contacto", err);
  }
});
