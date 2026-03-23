/**
 * AI Inquiry Email Drafter.
 *
 * Uses Sonnet to draft professional documentation request emails.
 * Falls back to template-based emails if LLM fails.
 */

import { callAIJson } from "@/lib/ai/model-router";
import { DRAFT_INQUIRY } from "@/lib/ai/prompt-registry";
import type { InquiryTrigger, InquiryTone } from "@prisma/client";

export interface DraftParams {
  trigger: InquiryTrigger;
  bankTransaction?: { amount: number; valueDate: string; concept: string; counterpartName?: string };
  invoice?: { number: string; date: string; amount: number; description?: string };
  contact: { name: string; accountingContact?: string; preferredLanguage?: string };
  company: { name: string };
  followUpNumber: number;
  previousSubject?: string;
  tone: InquiryTone;
}

export interface DraftResult {
  subject: string;
  htmlBody: string;
  plainBody: string;
}

export async function draftInquiryEmail(params: DraftParams): Promise<DraftResult> {
  const aiResult = await callAIJson(
    "draft_inquiry",
    DRAFT_INQUIRY.system,
    DRAFT_INQUIRY.buildUser({
      trigger: params.trigger,
      companyName: params.company.name,
      contactName: params.contact.name,
      accountingContact: params.contact.accountingContact,
      amount: params.bankTransaction?.amount ?? params.invoice?.amount,
      date: params.bankTransaction?.valueDate ?? params.invoice?.date,
      concept: params.bankTransaction?.concept,
      invoiceNumber: params.invoice?.number,
      followUpNumber: params.followUpNumber,
      previousSubject: params.previousSubject,
      tone: params.tone,
    }),
    DRAFT_INQUIRY.schema
  );

  if (aiResult) return aiResult;

  // Fallback: template-based email
  return generateTemplate(params);
}

function generateTemplate(params: DraftParams): DraftResult {
  const { trigger, bankTransaction, invoice, contact, company, followUpNumber } = params;
  const amount = bankTransaction?.amount ?? invoice?.amount ?? 0;
  const date = bankTransaction?.valueDate ?? invoice?.date ?? "";
  const concept = bankTransaction?.concept ?? invoice?.description ?? "";
  const isFollowUp = followUpNumber > 0;

  let subject = "";
  let body = "";

  if (trigger === "MISSING_INVOICE") {
    subject = isFollowUp
      ? `Recordatorio: Solicitud de factura — ${Math.abs(amount).toFixed(2)} EUR`
      : `Solicitud de factura — Pago de ${Math.abs(amount).toFixed(2)} EUR del ${date}`;

    body = isFollowUp
      ? `<p>Estimado/a ${contact.accountingContact ?? contact.name},</p>
<p>Le escribimos nuevamente en relación a nuestro email anterior. Seguimos pendientes de recibir la factura correspondiente al pago de <strong>${Math.abs(amount).toFixed(2)} EUR</strong> realizado el ${date}${concept ? ` con concepto "${concept}"` : ""}.</p>
<p>${followUpNumber >= 2 ? "Es urgente que nos la faciliten a la mayor brevedad, ya que necesitamos la documentación para el cierre del periodo." : "Le agradeceríamos que nos la enviara a este mismo email."}</p>
<p>Gracias por su colaboración.</p>
<p>Departamento de Administración<br/>${company.name}</p>`
      : `<p>Estimado/a ${contact.accountingContact ?? contact.name},</p>
<p>Hemos registrado un pago de <strong>${Math.abs(amount).toFixed(2)} EUR</strong> el ${date}${concept ? ` con concepto "${concept}"` : ""}. No hemos localizado la factura correspondiente en nuestro sistema.</p>
<p>¿Podrían enviárnosla a este email en los próximos 5 días laborables?</p>
<p>Gracias de antemano.</p>
<p>Departamento de Administración<br/>${company.name}</p>`;
  } else if (trigger === "MISSING_DOCUMENTATION") {
    subject = `Solicitud de documentación — Fra. ${invoice?.number ?? "N/A"}`;
    body = `<p>Estimado/a ${contact.accountingContact ?? contact.name},</p>
<p>En relación a la factura nº <strong>${invoice?.number ?? "N/A"}</strong> por importe de <strong>${Math.abs(amount).toFixed(2)} EUR</strong>, necesitamos documentación de soporte (contrato, albarán o pedido).</p>
<p>¿Podrían facilitárnosla?</p>
<p>Departamento de Administración<br/>${company.name}</p>`;
  } else {
    subject = `Consulta contable — ${company.name}`;
    body = `<p>Estimado/a ${contact.accountingContact ?? contact.name},</p>
<p>Necesitamos información adicional sobre una operación registrada por importe de ${Math.abs(amount).toFixed(2)} EUR${date ? ` del ${date}` : ""}.</p>
<p>¿Podrían contactarnos al respecto?</p>
<p>Departamento de Administración<br/>${company.name}</p>`;
  }

  // Generate plain text from HTML (strip tags)
  const plainBody = body.replace(/<[^>]*>/g, "").replace(/\n\n+/g, "\n\n").trim();

  return { subject, htmlBody: body, plainBody };
}
