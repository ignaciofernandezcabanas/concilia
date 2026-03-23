import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { z } from "zod";

/**
 * GET /api/settings/accounts?search=&group=&page=1&limit=50
 *
 * Returns PGC accounts for the company.
 * - search: filter by code or name
 * - group: filter by PGC group (1-7)
 * - all=true: return all accounts (no limit)
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const url = req.nextUrl;
  const search = url.searchParams.get("search") ?? "";
  const group = url.searchParams.get("group");
  const all = url.searchParams.get("all") === "true";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = all ? 500 : Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
  const skip = all ? 0 : (page - 1) * limit;

  const where = {
    companyId: ctx.company.id,
    isActive: true,
    ...(search
      ? {
          OR: [
            { code: { contains: search } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(group ? { group: parseInt(group) } : {}),
  };

  const [accounts, total] = await Promise.all([
    db.account.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        group: true,
        parentCode: true,
        pygLine: true,
        cashflowType: true,
        isActive: true,
      },
      orderBy: { code: "asc" },
      skip,
      take: limit,
    }),
    db.account.count({ where }),
  ]);

  return NextResponse.json({
    accounts,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
}, "read:dashboard");

const createSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  group: z.number().int().min(1).max(9),
  parentCode: z.string().optional(),
  pygLine: z.string().optional(),
  cashflowType: z.enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"]).optional(),
});

/**
 * POST /api/settings/accounts
 *
 * Creates a new PGC account.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { code, name, group, parentCode, pygLine, cashflowType } = parsed.data;

  // Check for duplicate
  const existing = await db.account.findUnique({
    where: { code_companyId: { code, companyId: ctx.company.id } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `La cuenta ${code} ya existe.` },
      { status: 409 }
    );
  }

  const account = await db.account.create({
    data: {
      code,
      name,
      group,
      parentCode: parentCode ?? (code.length > 1 ? code.slice(0, -1) : null),
      pygLine: pygLine ?? null,
      cashflowType: cashflowType ?? null,
      companyId: ctx.company.id,
    },
  });

  createAuditLog(db, {
    userId: ctx.user.id,
    action: "ACCOUNT_CREATED",
    entityType: "Account",
    entityId: account.id,
    details: { code, name, group },
  }).catch((err) =>
    console.warn("[accounts] Non-critical:", err instanceof Error ? err.message : err)
  );

  return NextResponse.json({ success: true, account }, { status: 201 });
}, "manage:settings");

const updateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1).optional(),
  pygLine: z.string().nullable().optional(),
  cashflowType: z.enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"]).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * PUT /api/settings/accounts
 *
 * Updates an existing account. Identified by code.
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { code, ...updates } = parsed.data;

  const account = await db.account.findUnique({
    where: { code_companyId: { code, companyId: ctx.company.id } },
  });
  if (!account) {
    return NextResponse.json({ error: `Cuenta ${code} no encontrada.` }, { status: 404 });
  }

  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  if (Object.keys(cleanUpdates).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 400 });
  }

  const updated = await db.account.update({
    where: { id: account.id },
    data: cleanUpdates,
  });

  createAuditLog(db, {
    userId: ctx.user.id,
    action: "ACCOUNT_UPDATED",
    entityType: "Account",
    entityId: account.id,
    details: { code, changes: cleanUpdates },
  }).catch((err) =>
    console.warn("[accounts] Non-critical:", err instanceof Error ? err.message : err)
  );

  return NextResponse.json({ success: true, account: updated });
}, "manage:settings");
