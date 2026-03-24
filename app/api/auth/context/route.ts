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
    const memberships = user.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      organization: m.organization,
      companies:
        m.role === "MEMBER" ? m.companyScopes.map((s) => ({ ...s.company, role: s.role })) : [], // OWNER/ADMIN see all companies in the org
    }));

    // For OWNER/ADMIN memberships, load all companies in the org
    for (const m of memberships) {
      if (m.role === "OWNER" || m.role === "ADMIN") {
        const orgCompanies = await prisma.company.findMany({
          where: { organizationId: m.organization.id },
          select: { id: true, name: true, shortName: true, cif: true, type: true },
        });
        m.companies = orgCompanies.map((c) => ({
          ...c,
          role: m.role === "OWNER" ? "ADMIN" : "ADMIN",
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
