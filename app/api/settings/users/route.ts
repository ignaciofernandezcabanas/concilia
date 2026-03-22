import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { createServerClient } from "@/lib/supabase";
import { userInviteSchema } from "@/lib/utils/validation";
import { createAuditLog } from "@/lib/utils/audit";
import { parsePagination, paginatedResponse } from "@/lib/utils/pagination";

/**
 * GET /api/settings/users
 *
 * Lists all users in the authenticated company.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;
    const { page, pageSize, skip, take } = parsePagination(
      req.nextUrl.searchParams
    );

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where: { companyId: company.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        skip,
        take,
      }),
      prisma.user.count({ where: { companyId: company.id } }),
    ]);

    return NextResponse.json(paginatedResponse(data, total, page, pageSize));
  },
  "manage:users"
);

/**
 * POST /api/settings/users
 *
 * Invites a new user to the company.
 * Creates a Supabase auth user (with invite email) and a corresponding
 * User record in the database.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { user, company } = ctx;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const parsed = userInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, name, role } = parsed.data;

    // Check if user already exists in this company
    const existing = await prisma.user.findFirst({
      where: { email, companyId: company.id },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists in this company." },
        { status: 409 }
      );
    }

    try {
      // Create Supabase auth user with invite
      const supabase = createServerClient();
      const { data: authData, error: authError } =
        await supabase.auth.admin.inviteUserByEmail(email, {
          data: {
            company_id: company.id,
            company_name: company.name,
            role,
          },
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        });

      if (authError) {
        console.error("[settings/users] Supabase invite error:", authError);
        return NextResponse.json(
          {
            error: "Failed to send invitation.",
            details: authError.message,
          },
          { status: 500 }
        );
      }

      // Create user in our database
      const newUser = await prisma.user.create({
        data: {
          email,
          name: name ?? null,
          role: role as any,
          status: "PENDING",
          companyId: company.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });

      // Create notification for the invited user (will be visible after they accept)
      await prisma.notification.create({
        data: {
          type: "SYSTEM",
          title: "Bienvenido a Concilia",
          body: `Has sido invitado a ${company.name} por ${user.email}. Completa tu registro para acceder.`,
          userId: newUser.id,
          companyId: company.id,
        },
      });

      createAuditLog({
        userId: user.id,
        action: "USER_INVITED",
        entityType: "User",
        entityId: newUser.id,
        details: { email, role },
      }).catch(() => {});

      return NextResponse.json(
        { success: true, user: newUser },
        { status: 201 }
      );
    } catch (err) {
      console.error("[settings/users] Error:", err);
      return NextResponse.json(
        {
          error: "Failed to invite user.",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }
  },
  "manage:users"
);
