import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/utils/audit";
import { z } from "zod";

/**
 * GET /api/fixed-assets?status=ACTIVE&page=1&limit=20
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const url = req.nextUrl;
    const status = url.searchParams.get("status");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where = {
      companyId: ctx.company.id,
      ...(status ? { status: status as "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED" } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.fixedAsset.findMany({
        where,
        include: {
          assetAccount: { select: { code: true, name: true } },
          depreciationAccount: { select: { code: true, name: true } },
          accumDepAccount: { select: { code: true, name: true } },
        },
        orderBy: { acquisitionDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.fixedAsset.count({ where }),
    ]);

    // Summary stats
    const summary = await prisma.fixedAsset.aggregate({
      where: { companyId: ctx.company.id, status: "ACTIVE" },
      _sum: { acquisitionCost: true, accumulatedDepreciation: true, netBookValue: true },
      _count: true,
    });

    return NextResponse.json({
      data,
      summary: {
        activeCount: summary._count,
        totalCost: summary._sum.acquisitionCost ?? 0,
        totalDepreciation: summary._sum.accumulatedDepreciation ?? 0,
        totalNetBookValue: summary._sum.netBookValue ?? 0,
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
  "read:reports"
);

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  serialNumber: z.string().optional(),
  acquisitionDate: z.string().transform((s) => new Date(s)),
  acquisitionCost: z.number().positive(),
  residualValue: z.number().min(0).default(0),
  usefulLifeMonths: z.number().int().min(1),
  depreciationMethod: z.enum(["LINEAR", "DECLINING_BALANCE"]).default("LINEAR"),
  assetAccountCode: z.string().min(1),
  depreciationAccountCode: z.string().min(1),
  accumDepAccountCode: z.string().min(1),
});

/**
 * POST /api/fixed-assets
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;

    // Resolve account codes
    const codes = [d.assetAccountCode, d.depreciationAccountCode, d.accumDepAccountCode];
    const accounts = await prisma.account.findMany({
      where: { code: { in: codes }, companyId: ctx.company.id },
      select: { id: true, code: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

    for (const code of codes) {
      if (!accountMap.has(code)) {
        return NextResponse.json({ error: `Cuenta ${code} no encontrada.` }, { status: 400 });
      }
    }

    // Calculate monthly depreciation
    const depreciableAmount = d.acquisitionCost - d.residualValue;
    const monthlyDep = Math.round((depreciableAmount / d.usefulLifeMonths) * 100) / 100;

    const asset = await prisma.fixedAsset.create({
      data: {
        name: d.name,
        description: d.description,
        serialNumber: d.serialNumber,
        acquisitionDate: d.acquisitionDate,
        acquisitionCost: d.acquisitionCost,
        residualValue: d.residualValue,
        usefulLifeMonths: d.usefulLifeMonths,
        depreciationMethod: d.depreciationMethod,
        netBookValue: d.acquisitionCost,
        monthlyDepreciation: monthlyDep,
        assetAccountId: accountMap.get(d.assetAccountCode)!,
        depreciationAccountId: accountMap.get(d.depreciationAccountCode)!,
        accumDepAccountId: accountMap.get(d.accumDepAccountCode)!,
        companyId: ctx.company.id,
      },
      include: {
        assetAccount: { select: { code: true, name: true } },
        depreciationAccount: { select: { code: true, name: true } },
        accumDepAccount: { select: { code: true, name: true } },
      },
    });

    createAuditLog({
      userId: ctx.user.id,
      action: "FIXED_ASSET_CREATED",
      entityType: "FixedAsset",
      entityId: asset.id,
      details: { name: d.name, cost: d.acquisitionCost, usefulLife: d.usefulLifeMonths },
    }).catch((err) =>
      console.warn("[fixed-assets] Non-critical:", err instanceof Error ? err.message : err)
    );

    return NextResponse.json({ success: true, asset }, { status: 201 });
  },
  "manage:settings"
);
