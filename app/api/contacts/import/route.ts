/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { callAIJson } from "@/lib/ai/model-router";
import { IMPORT_CONTACTS_FILE } from "@/lib/ai/prompt-registry";
import { normalizeNif, updateContactIfNewData } from "@/lib/contacts/utils";

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Archivo requerido." }, { status: 400 });
    }

    const content = await file.text();
    const aiResult = await callAIJson(
      "import_contacts_file",
      IMPORT_CONTACTS_FILE.system,
      IMPORT_CONTACTS_FILE.buildUser({ content, filename: file.name }),
      IMPORT_CONTACTS_FILE.schema
    );

    if (!aiResult) {
      return NextResponse.json({ error: "AI parsing failed." }, { status: 502 });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const contact of aiResult.contacts) {
      if (!contact.name) {
        skipped++;
        continue;
      }

      const normalizedNif = normalizeNif(contact.nif);

      try {
        // Check if contact exists by normalized NIF
        let existing: any = null;
        if (normalizedNif) {
          const allContacts = await db.contact.findMany({
            where: { cif: { not: null } },
          });
          existing = allContacts.find((c: any) => normalizeNif(c.cif) === normalizedNif);
        }

        if (existing) {
          const didUpdate = await updateContactIfNewData(db, existing.id, existing, {
            email: contact.email,
            iban: contact.iban,
            paymentTermsDays: contact.paymentTermsDays,
          });
          if (didUpdate) updated++;
          else skipped++;
        } else {
          await (db as any).contact.create({
            data: {
              holdedId: `import:${normalizedNif ?? contact.name}`,
              name: contact.name,
              cif: normalizedNif,
              email: contact.email,
              iban: contact.iban,
              type: contact.type,
              paymentTermsDays: contact.paymentTermsDays,
              companyId: ctx.company.id,
            },
          });
          created++;
        }
      } catch (err) {
        errors.push(`${contact.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      created,
      updated,
      skipped,
      errors,
      formatDetected: aiResult.formatDetected,
      warnings: aiResult.warnings,
    });
  } catch (err) {
    return errorResponse("Error al importar contactos.", err);
  }
}, "manage:settings");
