import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cron creates scoped db per company
import { HoldedClient } from "@/lib/holded/client";
import type { HoldedInvoice, HoldedContact } from "@/lib/holded/client";

/**
 * POST /api/sync/holded
 *
 * Syncs invoices, contacts, accounts, and payments from Holded.
 * Can be triggered by QStash (cron) with signature verification,
 * or by an authenticated user with a Bearer token.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify caller: QStash signature OR auth token
    const companyId = await verifyCallerAndGetCompanyId(req);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // Get Holded integration config
    const integration = await prisma.integration.findUnique({
      where: {
        type_companyId: { type: "HOLDED", companyId },
      },
    });

    if (!integration || integration.status !== "CONNECTED") {
      return NextResponse.json({ error: "Holded integration not connected." }, { status: 400 });
    }

    const config = integration.config as { apiKey: string } | null;
    if (!config?.apiKey) {
      return NextResponse.json({ error: "Holded API key not configured." }, { status: 400 });
    }

    const client = new HoldedClient(config.apiKey);
    const startedAt = new Date();
    let recordsProcessed = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;
    const errors: string[] = [];

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        companyId,
        source: "HOLDED",
        action: "FULL_SYNC",
        status: "RUNNING",
        startedAt,
      },
    });

    try {
      // 1. Sync contacts
      const contacts = await client.getAllContacts();
      for (const contact of contacts) {
        try {
          const contactType = mapContactType(contact.type);
          const result = await prisma.contact.upsert({
            where: {
              holdedId_companyId: {
                holdedId: contact.id,
                companyId,
              },
            },
            update: {
              name: contact.name,
              cif: contact.vatnumber,
              iban: contact.iban,
              type: contactType,
            },
            create: {
              holdedId: contact.id,
              companyId,
              name: contact.name,
              cif: contact.vatnumber,
              iban: contact.iban,
              type: contactType,
            },
          });
          recordsProcessed++;
          // If the record was just created (no updatedAt in past), count as created
          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            recordsCreated++;
          } else {
            recordsUpdated++;
          }
        } catch (err) {
          errors.push(`Contact ${contact.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 2. Sync accounts (chart of accounts)
      const accounts = await client.getAccounts();
      await syncAccountsRecursive(accounts, companyId, null);

      // 3. Sync issued invoices
      const lastSync = integration.lastSyncAt ?? undefined;
      const issuedInvoices = await client.getAllInvoices(lastSync);
      for (const inv of issuedInvoices) {
        try {
          const stats = await upsertInvoice(inv, companyId, "ISSUED", client);
          recordsProcessed++;
          if (stats === "created") recordsCreated++;
          else recordsUpdated++;
        } catch (err) {
          errors.push(`Invoice ${inv.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 4. Sync received invoices (purchases)
      const purchases = await client.getAllPurchases(lastSync);
      for (const inv of purchases) {
        try {
          const stats = await upsertInvoice(inv, companyId, "RECEIVED", client);
          recordsProcessed++;
          if (stats === "created") recordsCreated++;
          else recordsUpdated++;
        } catch (err) {
          errors.push(`Purchase ${inv.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Update integration last sync
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          status: "CONNECTED",
          error: null,
        },
      });

      // Update sync log
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          recordsProcessed,
          recordsCreated,
          recordsUpdated,
          errors: errors.length > 0 ? errors : undefined,
          duration: Date.now() - startedAt.getTime(),
          completedAt: new Date(),
        },
      });

      // Trigger reconciliation after sync
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await fetch(`${baseUrl}/api/reconciliation/run`, {
          method: "POST",
          headers: {
            Authorization: req.headers.get("authorization") ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ companyId }),
        });
      } catch {
        // Non-critical: reconciliation can be triggered manually
      }

      return NextResponse.json({
        success: true,
        syncLogId: syncLog.id,
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      // Update sync log with failure
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "FAILED",
          errors: [err instanceof Error ? err.message : String(err)],
          duration: Date.now() - startedAt.getTime(),
          completedAt: new Date(),
        },
      });

      // Mark integration as errored
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: "ERROR",
          error: err instanceof Error ? err.message : String(err),
        },
      });

      throw err;
    }
  } catch (err) {
    console.error("[sync/holded] Error:", err);
    return errorResponse("Sync failed.", err, 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyCallerAndGetCompanyId(req: NextRequest): Promise<string | null> {
  // Check QStash signature
  const qstashSignature = req.headers.get("upstash-signature");
  if (qstashSignature) {
    try {
      const { Receiver } = await import("@upstash/qstash");
      const receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
      });
      const body = await req.text();
      await receiver.verify({ signature: qstashSignature, body });
      const parsed = JSON.parse(body);
      return parsed.companyId ?? null;
    } catch {
      return null;
    }
  }

  // Check Bearer auth token
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const { createServerClient } = await import("@/lib/supabase");
    const supabase = createServerClient();
    const token = authHeader.slice(7);
    const {
      data: { user: supabaseUser },
    } = await supabase.auth.getUser(token);

    if (!supabaseUser) return null;

    const user = await prisma.user.findFirst({
      where: { email: supabaseUser.email!, status: "ACTIVE" },
      select: { companyId: true },
    });

    return user?.companyId ?? null;
  }

  return null;
}

function mapContactType(holdedType: string): "CUSTOMER" | "SUPPLIER" | "BOTH" {
  switch (holdedType) {
    case "client":
      return "CUSTOMER";
    case "supplier":
      return "SUPPLIER";
    case "clientsupplier":
      return "BOTH";
    default:
      return "CUSTOMER";
  }
}

async function syncAccountsRecursive(
  accounts: { id: string; accountNum: string; name: string; children?: any[] }[],
  companyId: string,
  parentCode: string | null
): Promise<void> {
  for (const acct of accounts) {
    const group = parseInt(acct.accountNum.charAt(0), 10) || 0;
    await prisma.account.upsert({
      where: {
        code_companyId: { code: acct.accountNum, companyId },
      },
      update: {
        name: acct.name,
        parentCode,
        group,
      },
      create: {
        code: acct.accountNum,
        companyId,
        name: acct.name,
        parentCode,
        group,
      },
    });

    if (acct.children && acct.children.length > 0) {
      await syncAccountsRecursive(acct.children, companyId, acct.accountNum);
    }
  }
}

async function upsertInvoice(
  inv: HoldedInvoice,
  companyId: string,
  type: "ISSUED" | "RECEIVED",
  client: HoldedClient
): Promise<"created" | "updated"> {
  // Map Holded status to our enum
  const statusMap: Record<number, string> = {
    0: "PENDING",
    1: "PAID",
    2: "OVERDUE",
    3: "PARTIAL",
  };
  const status = statusMap[inv.status] ?? "PENDING";

  // Find contact by holdedId
  const contact = inv.contactId
    ? await prisma.contact.findFirst({
        where: { holdedId: inv.contactId, companyId },
        select: { id: true },
      })
    : null;

  const existing = await prisma.invoice.findFirst({
    where: { holdedId: inv.id, companyId },
    select: { id: true },
  });

  const invoiceData = {
    number: inv.docNumber,
    type,
    issueDate: new Date(inv.date * 1000),
    dueDate: inv.dueDate ? new Date(inv.dueDate * 1000) : null,
    totalAmount: inv.total,
    netAmount: inv.subtotal,
    vatAmount: inv.tax,
    currency: inv.currency || "EUR",
    description: inv.desc,
    status: status as any,
    amountPaid: inv.paid,
    amountPending: inv.total - inv.paid,
    syncedAt: new Date(),
    contactId: contact?.id ?? null,
  };

  if (existing) {
    await prisma.invoice.update({
      where: { id: existing.id },
      data: invoiceData,
    });
    return "updated";
  }

  const created = await prisma.invoice.create({
    data: {
      holdedId: inv.id,
      companyId,
      ...invoiceData,
    },
  });

  // Sync invoice lines
  if (inv.items && inv.items.length > 0) {
    for (const item of inv.items) {
      // Try to find matching PGC account
      let accountId: string | null = null;
      if (item.accountNumber) {
        const account = await prisma.account.findFirst({
          where: { code: item.accountNumber, companyId },
          select: { id: true },
        });
        accountId = account?.id ?? null;
      }

      await prisma.invoiceLine.create({
        data: {
          invoiceId: created.id,
          description: item.name,
          quantity: item.units,
          unitPrice: item.subtotal / (item.units || 1),
          totalAmount: item.total,
          vatRate: item.subtotal > 0 ? (item.tax / item.subtotal) * 100 : 0,
          accountId,
        },
      });
    }
  }

  // Sync payments
  try {
    const payments = await client.getPayments(inv.id);
    for (const payment of payments) {
      await prisma.payment.upsert({
        where: { holdedId: payment.id },
        update: {
          amount: payment.amount,
          date: new Date(payment.date * 1000),
          method: payment.paymentMethod ?? null,
        },
        create: {
          holdedId: payment.id,
          invoiceId: created.id,
          amount: payment.amount,
          date: new Date(payment.date * 1000),
          method: payment.paymentMethod ?? null,
        },
      });
    }
  } catch {
    // Non-critical: payments can be synced later
  }

  return "created";
}
