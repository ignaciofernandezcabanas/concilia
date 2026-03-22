import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createServerClient } from "@/lib/supabase";
import {
  hasPermission,
  type Permission,
} from "@/lib/auth/permissions";
import type { User, Company, Role } from "@prisma/client";

export interface AuthContext {
  user: User;
  company: Company;
}

type AuthenticatedHandler = (
  req: NextRequest,
  ctx: AuthContext & { params?: Record<string, string> }
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a Next.js Route Handler with authentication and optional permission checks.
 *
 * - Extracts and verifies the Supabase JWT from the Authorization header.
 * - Loads the User (with ACTIVE status) and their Company from the database.
 * - Optionally checks role-based permission.
 * - Injects `{ user, company }` into the handler context.
 *
 * Returns 401 for missing/invalid tokens or inactive users.
 * Returns 403 for insufficient permissions.
 */
export function withAuth(
  handler: AuthenticatedHandler,
  requiredPermission?: Permission
) {
  return async (
    req: NextRequest,
    routeCtx?: { params?: Record<string, string> }
  ): Promise<NextResponse> => {
    try {
      // Extract Bearer token
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "Missing or malformed Authorization header." },
          { status: 401 }
        );
      }
      const token = authHeader.slice(7);

      // Verify JWT with Supabase
      const supabase = createServerClient();
      const {
        data: { user: supabaseUser },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !supabaseUser) {
        return NextResponse.json(
          { error: "Invalid or expired token." },
          { status: 401 }
        );
      }

      // Look up user in our database
      const user = await prisma.user.findFirst({
        where: {
          email: supabaseUser.email!,
          status: "ACTIVE",
        },
        include: {
          company: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: "User not found or account is inactive." },
          { status: 401 }
        );
      }

      const { company, ...userWithoutCompany } = user;

      // Check permission if required
      if (requiredPermission) {
        if (!hasPermission(user.role as Role, requiredPermission)) {
          return NextResponse.json(
            {
              error: "Insufficient permissions.",
              required: requiredPermission,
            },
            { status: 403 }
          );
        }
      }

      // Update last login timestamp (fire-and-forget)
      prisma.user
        .update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })
        .catch(() => {
          // Non-critical: silently ignore last-login update failures
        });

      return handler(req, {
        user: userWithoutCompany as User,
        company,
        params: routeCtx?.params,
      });
    } catch (error) {
      console.error("[withAuth] Unexpected error:", error instanceof Error ? error.message : error);
      console.error("[withAuth] Stack:", error instanceof Error ? error.stack : "no stack");
      return NextResponse.json(
        { error: "Internal authentication error.", detail: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  };
}
