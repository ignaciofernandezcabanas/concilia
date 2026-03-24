import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cron creates scoped db per company
import { withCronAuth } from "@/lib/auth/cron-guard";

/**
 * POST /api/cron/overdue-check
 * Protected by QStash signature or CRON_SECRET.
 */
export const POST = withCronAuth(async (req: NextRequest) => {
  try {
    let companyId: string | undefined;
    try {
      const body = await req.text();
      if (body) companyId = JSON.parse(body).companyId;
    } catch {
      /* no body */
    }
    const now = new Date();

    // Build company filter
    const companyFilter = companyId ? { companyId } : {};

    // Find invoices that are overdue: dueDate < now AND status is PENDING or PARTIAL
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        ...companyFilter,
        dueDate: { lt: now },
        status: { in: ["PENDING", "PARTIAL"] },
      },
      include: {
        contact: { select: { name: true } },
        company: { select: { id: true, name: true } },
      },
    });

    if (overdueInvoices.length === 0) {
      return NextResponse.json({
        success: true,
        overdueCount: 0,
        notificationsCreated: 0,
      });
    }

    // Update all to OVERDUE status
    const invoiceIds = overdueInvoices.map((inv: { id: string }) => inv.id);
    await prisma.invoice.updateMany({
      where: { id: { in: invoiceIds } },
      data: { status: "OVERDUE" },
    });

    // Group by company for notifications
    const byCompany = new Map<string, typeof overdueInvoices>();
    for (const inv of overdueInvoices) {
      const cId = inv.companyId;
      if (!byCompany.has(cId)) byCompany.set(cId, []);
      byCompany.get(cId)!.push(inv);
    }

    let notificationsCreated = 0;

    for (const [cId, invoices] of Array.from(byCompany)) {
      // Get admin and editor users for this company
      const users = await prisma.user.findMany({
        where: {
          companyId: cId,
          status: "ACTIVE",
          role: { in: ["ADMIN", "EDITOR"] },
        },
        select: { id: true },
      });

      // Calculate total overdue amount
      const totalOverdue = invoices.reduce(
        (sum: number, inv: (typeof invoices)[number]) =>
          sum + (inv.amountPending ?? inv.totalAmount - inv.amountPaid),
        0
      );

      // Create a notification for each user
      for (const user of users) {
        if (invoices.length === 1) {
          const inv = invoices[0];
          await prisma.notification.create({
            data: {
              type: "FINANCIAL_ALERT",
              title: `Factura vencida: ${inv.number}`,
              body: `La factura ${inv.number} de ${inv.contact?.name ?? "desconocido"} venció el ${inv.dueDate?.toISOString().slice(0, 10)} con un importe pendiente de ${(inv.amountPending ?? inv.totalAmount - inv.amountPaid).toFixed(2)} EUR.`,
              actionUrl: `/invoices/${inv.id}`,
              metadata: {
                invoiceId: inv.id,
                invoiceNumber: inv.number,
                amount: inv.amountPending ?? inv.totalAmount - inv.amountPaid,
              },
              userId: user.id,
              companyId: cId,
            },
          });
        } else {
          await prisma.notification.create({
            data: {
              type: "FINANCIAL_ALERT",
              title: `${invoices.length} facturas vencidas`,
              body: `Se han detectado ${invoices.length} facturas vencidas por un total de ${totalOverdue.toFixed(2)} EUR. Revise la lista de facturas para más detalles.`,
              actionUrl: "/invoices?status=OVERDUE",
              metadata: {
                overdueCount: invoices.length,
                totalAmount: totalOverdue,
                invoiceIds: invoices.map((i: (typeof invoices)[number]) => i.id),
              },
              userId: user.id,
              companyId: cId,
            },
          });
        }
        notificationsCreated++;
      }
    }

    // ── PRE-DUE-DATE ALERTS ──
    // Find invoices approaching due date (within preAlertDays)
    let preAlertCount = 0;

    const companies = await prisma.company.findMany({
      where: companyId ? { id: companyId } : {},
      select: { id: true, preAlertDays: true },
    });

    for (const comp of companies) {
      const alertDate = new Date();
      alertDate.setDate(alertDate.getDate() + comp.preAlertDays);

      const soonDue = await prisma.invoice.findMany({
        where: {
          companyId: comp.id,
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { gt: now, lte: alertDate },
        },
        include: {
          contact: { select: { name: true } },
        },
      });

      if (soonDue.length === 0) continue;

      const users = await prisma.user.findMany({
        where: { companyId: comp.id, role: { in: ["ADMIN", "EDITOR"] }, status: "ACTIVE" },
        select: { id: true },
      });

      for (const u of users) {
        // Check we haven't already alerted today for these
        const existingAlert = await prisma.notification.findFirst({
          where: {
            userId: u.id,
            type: "FINANCIAL_ALERT",
            title: { contains: "próximas a vencer" },
            createdAt: { gte: new Date(now.toISOString().slice(0, 10)) },
          },
        });
        if (existingAlert) continue;

        const totalAmount = soonDue.reduce(
          (s, i) => s + (i.amountPending ?? i.totalAmount - i.amountPaid),
          0
        );
        await prisma.notification.create({
          data: {
            type: "FINANCIAL_ALERT",
            title: `${soonDue.length} factura${soonDue.length > 1 ? "s" : ""} próximas a vencer`,
            body: `Hay ${soonDue.length} facturas por ${totalAmount.toFixed(2)} EUR que vencen en los próximos ${comp.preAlertDays} días.`,
            actionUrl: "/facturas?status=PENDING",
            userId: u.id,
            companyId: comp.id,
          },
        });
        preAlertCount++;
      }
    }

    return NextResponse.json({
      success: true,
      overdueCount: overdueInvoices.length,
      preAlertCount,
      notificationsCreated,
      invoiceIds,
    });
  } catch (err) {
    console.error("[cron/overdue-check] Error:", err);
    return errorResponse("Overdue check failed.", err, 500);
  }
});
