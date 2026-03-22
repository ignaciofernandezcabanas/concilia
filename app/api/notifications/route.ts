import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/utils/pagination";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/notifications
 *
 * Lists notifications for the authenticated user.
 *
 * Query params:
 *   isRead   - Filter by read status ("true" or "false")
 *   page     - Page number (default: 1)
 *   pageSize - Items per page (default: 25)
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { user, company } = ctx;
    const searchParams = req.nextUrl.searchParams;
    const { page, pageSize, skip, take } = parsePagination(searchParams);

    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      companyId: company.id,
    };

    const isReadParam = searchParams.get("isRead");
    if (isReadParam === "true") {
      where.isRead = true;
    } else if (isReadParam === "false") {
      where.isRead = false;
    }

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(data, total, page, pageSize));
  },
  "read:notifications"
);

/**
 * POST /api/notifications
 *
 * Marks notifications as read.
 *
 * Body:
 *   { ids: string[] }          - Mark specific notifications as read
 *   { markAllRead: true }      - Mark all unread notifications as read
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { user, company } = ctx;

    let body: { ids?: string[]; markAllRead?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    if (body.markAllRead) {
      const result = await prisma.notification.updateMany({
        where: {
          userId: user.id,
          companyId: company.id,
          isRead: false,
        },
        data: { isRead: true },
      });

      return NextResponse.json({
        success: true,
        updated: result.count,
      });
    }

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      const result = await prisma.notification.updateMany({
        where: {
          id: { in: body.ids },
          userId: user.id,
          companyId: company.id,
        },
        data: { isRead: true },
      });

      return NextResponse.json({
        success: true,
        updated: result.count,
      });
    }

    return NextResponse.json(
      { error: 'Provide "ids" array or "markAllRead: true".' },
      { status: 400 }
    );
  },
  "read:notifications"
);
