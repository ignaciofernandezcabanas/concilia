import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: no company context yet
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/auth/context
 *
 * Returns the user's organization context: memberships, companies, active selection.
 * Does NOT use withAuth (it needs to work before company context is established).
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();
    const {
      data: { user: supabaseUser },
      error,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (error || !supabaseUser) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: { email: supabaseUser.email!, status: "ACTIVE" },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            shortName: true,
            cif: true,
            type: true,
            organizationId: true,
          },
        },
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            organization: { select: { id: true, name: true } },
            companyScopes: {
              include: {
                company: {
                  select: { id: true, name: true, shortName: true, cif: true, type: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Build accessible companies from memberships
    const memberships = user.memberships.map((m: (typeof user.memberships)[number]) => ({
      id: m.id,
      role: m.role,
      organization: m.organization,
      companies:
        m.role === "MEMBER"
          ? m.companyScopes.map((s: (typeof m.companyScopes)[number]) => ({
              ...s.company,
              role: s.role,
            }))
          : [], // OWNER/ADMIN see all companies in the org
    }));

    // For OWNER/ADMIN memberships, load all companies in the org
    for (const m of memberships) {
      if (m.role === "OWNER" || m.role === "ADMIN") {
        const orgCompanies = await prisma.company.findMany({
          where: { organizationId: m.organization.id },
          select: { id: true, name: true, shortName: true, cif: true, type: true },
        });
        m.companies = orgCompanies.map((c: (typeof orgCompanies)[number]) => ({
          ...c,
          role: "ADMIN" as const, // OWNER and ADMIN at org level both map to ADMIN at company level
        }));
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        activeOrgId: user.activeOrgId,
        activeCompanyId: user.activeCompanyId ?? user.companyId,
        tourCompletedAt: user.tourCompletedAt,
      },
      memberships,
    });
  } catch (err) {
    console.error("[auth/context]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/auth/context
 * Switch active company or organization.
 * Body: { companyId?: string, orgId?: string, consolidated?: boolean }
 */
export async function PUT(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();
    const {
      data: { user: supabaseUser },
      error,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (error || !supabaseUser) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: { email: supabaseUser.email!, status: "ACTIVE" },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const body = await req.json();

    // Validate user has access to target company (prevent IDOR)
    if (body.companyId) {
      // Check 1: explicit CompanyScope access
      const scopeAccess = await prisma.companyScope.findFirst({
        where: {
          companyId: body.companyId,
          membership: { userId: user.id, status: "ACTIVE" },
        },
      });
      if (!scopeAccess) {
        // Check 2: OWNER/ADMIN of the org that owns the company
        const company = await prisma.company.findUnique({
          where: { id: body.companyId },
          select: { organizationId: true },
        });
        const orgAccess = company
          ? await prisma.membership.findFirst({
              where: {
                userId: user.id,
                organizationId: company.organizationId!,
                status: "ACTIVE",
                role: { in: ["OWNER", "ADMIN"] },
              },
            })
          : null;
        if (!orgAccess) {
          return NextResponse.json({ error: "No tienes acceso a esta empresa." }, { status: 403 });
        }
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.companyId !== undefined ? { activeCompanyId: body.companyId } : {}),
        ...(body.orgId !== undefined ? { activeOrgId: body.orgId } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/context PUT]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
