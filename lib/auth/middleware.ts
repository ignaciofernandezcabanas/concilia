import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getScopedDb, type ScopedPrisma } from "@/lib/db-scoped";
import { createServerClient } from "@/lib/supabase";
import {
  hasPermission,
  type Permission,
} from "@/lib/auth/permissions";
import type { User, Company, Role } from "@prisma/client";

export interface AuthContext {
  user: User;
  company: Company;
  /** Scoped Prisma client — auto-injects companyId in all queries */
  db: ScopedPrisma;
}

type AuthenticatedHandler = (
  req: NextRequest,
  ctx: AuthContext & { params?: Record<string, string> }
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a Next.js Route Handler with authentication and optional permission checks.
 *
 * Injects `{ user, company, db }` into the handler context.
 * `db` is a scoped Prisma client that auto-filters by companyId.
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
      });

      if (!user) {
        return NextResponse.json(
          { error: "User not found or account is inactive." },
          { status: 401 }
        );
      }

      // Resolve active company: activeCompanyId (multi-tenant) → companyId (legacy)
      const activeCompanyId = user.activeCompanyId ?? user.companyId;
      const company = await prisma.company.findUnique({
        where: { id: activeCompanyId },
      });

      if (!company) {
        return NextResponse.json(
          { error: "No active company. Please select a company." },
          { status: 400 }
        );
      }

      // Check permission if required
      if (requiredPermission) {
        if (!hasPermission(user.role as Role, requiredPermission)) {
          return NextResponse.json(
            { error: "Insufficient permissions." },
            { status: 403 }
          );
        }
      }

      // Update last login — throttled to 1/hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (!user.lastLoginAt || user.lastLoginAt < oneHourAgo) {
        prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch((err) => {
            console.warn("[auth] Failed to update lastLoginAt:", err instanceof Error ? err.message : err);
          });
      }

      // Create scoped DB client
      const db = getScopedDb(company.id);

      return handler(req, {
        user,
        company,
        db,
        params: routeCtx?.params,
      });
    } catch (error) {
      console.error("[withAuth] Unexpected error:", error instanceof Error ? error.message : error);
      return NextResponse.json(
        { error: "Internal authentication error." },
        { status: 500 }
      );
    }
  };
}
