/**
 * Contextual Reply Generator for Inquiry Follow-ups.
 *
 * Generates reply drafts based on the evaluation result and proposed action.
 * Uses the existing DRAFT_INQUIRY prompt with follow-up context.
 */

import { callAIJson } from "@/lib/ai/model-router";
import { DRAFT_INQUIRY } from "@/lib/ai/prompt-registry";
import type { ProposedAction } from "@prisma/client";
import type { ResponseEvaluation } from "@/lib/email/response-evaluator";

export interface ReplyDraftParams {
  inquiry: {
    subject: string;
    triggerType: string;
    recipientName: string;
    followUpNumber: number;
    tone: string;
  };
  evaluation: ResponseEvaluation;
  proposedAction: ProposedAction;
  bankTransaction?: { amount: number; valueDate: string; concept: string };
  companyName: string;
}

export interface ReplyDraft {
  subject: string;
  htmlBody: string;
  plainBody: string;
}

export async function draftReplyEmail(params: ReplyDraftParams): Promise<ReplyDraft> {
  const { inquiry, evaluation, proposedAction, bankTransaction, companyName } = params;

  // Build context for the AI drafter
  const actionContext = getActionContext(proposedAction, evaluation);

  const aiResult = await callAIJson(
    "draft_inquiry",
    DRAFT_INQUIRY.system,
    DRAFT_INQUIRY.buildUser({
      trigger: `${inquiry.triggerType}_REPLY`,
      companyName,
      contactName: inquiry.recipientName,
      amount: bankTransaction?.amount,
      date: bankTransaction?.valueDate,
      concept: `${bankTransaction?.concept ?? ""} — ${actionContext}`,
      followUpNumber: inquiry.followUpNumber + 1,
      previousSubject: inquiry.subject,
      tone: inquiry.tone,
    }),
    DRAFT_INQUIRY.schema
  );

  if (aiResult) {
    return {
      subject: `Re: ${inquiry.subject}`,
      htmlBody: aiResult.htmlBody,
      plainBody: aiResult.plainBody,
    };
  }

  // Fallback: template-based reply
  return generateTemplateReply(params);
}

function getActionContext(action: ProposedAction, evaluation: ResponseEvaluation): string {
  switch (action) {
    case "REPLY_REQUEST_DOCUMENT":
      return "Prometieron enviar pero no adjuntaron. Pedir que adjunten el documento.";
    case "REPLY_REQUEST_CORRECT":
      return `Adjuntaron documento equivocado: ${evaluation.documentValidation?.issues.join(". ") ?? "importe/emisor no coincide"}.`;
    case "REPLY_CLARIFY":
      return `Nos preguntan: "${evaluation.textAnalysis.questionAsked ?? ""}". Responder con datos del movimiento.`;
    case "REPLY_REDIRECT":
      return `Redirigen a ${evaluation.textAnalysis.redirectContact?.name ?? "otro contacto"}. Reenviar consulta original.`;
    default:
      return "Follow-up estándar.";
  }
}

function generateTemplateReply(params: ReplyDraftParams): ReplyDraft {
  const { inquiry, evaluation, proposedAction, bankTransaction, companyName } = params;
  const amount = bankTransaction ? Math.abs(bankTransaction.amount).toFixed(2) : "N/A";
  let body = "";

  switch (proposedAction) {
    case "REPLY_REQUEST_DOCUMENT":
      body = `<p>Estimado/a ${inquiry.recipientName},</p>
<p>Gracias por su respuesta. Quedamos a la espera de la factura correspondiente al pago de <strong>${amount} EUR</strong>.</p>
<p>¿Podrían confirmarnos una fecha estimada de envío?</p>
<p>Departamento de Administración<br/>${companyName}</p>`;
      break;

    case "REPLY_REQUEST_CORRECT":
      body = `<p>Estimado/a ${inquiry.recipientName},</p>
<p>Gracias por enviarnos la documentación. Sin embargo, hemos detectado una discrepancia:</p>
<p>${evaluation.documentValidation?.issues.map((i) => `- ${i}`).join("<br/>") ?? "El documento no coincide con el movimiento registrado."}</p>
<p>¿Podrían verificar y enviarnos la factura correcta?</p>
<p>Departamento de Administración<br/>${companyName}</p>`;
      break;

    case "REPLY_CLARIFY":
      body = `<p>Estimado/a ${inquiry.recipientName},</p>
<p>En relación a su consulta, le facilitamos los siguientes datos:</p>
<p>- Importe: ${amount} EUR<br/>
- Fecha: ${bankTransaction?.valueDate ?? "N/A"}<br/>
- Concepto bancario: ${bankTransaction?.concept ?? "N/A"}</p>
<p>Esperamos que esta información les sea útil para localizar la documentación.</p>
<p>Departamento de Administración<br/>${companyName}</p>`;
      break;

    case "REPLY_REDIRECT":
      body = `<p>Estimado/a ${evaluation.textAnalysis.redirectContact?.name ?? inquiry.recipientName},</p>
<p>Nos han indicado desde ${inquiry.recipientName} que usted puede ayudarnos con una solicitud de documentación.</p>
<p>Necesitamos la factura correspondiente a un pago de <strong>${amount} EUR</strong>${bankTransaction?.valueDate ? ` del ${bankTransaction.valueDate}` : ""}.</p>
<p>¿Podrían facilitárnosla?</p>
<p>Departamento de Administración<br/>${companyName}</p>`;
      break;

    default:
      body = `<p>Estimado/a ${inquiry.recipientName},</p>
<p>Seguimos pendientes de la documentación solicitada por importe de ${amount} EUR.</p>
<p>Departamento de Administración<br/>${companyName}</p>`;
  }

  const plainBody = body.replace(/<[^>]*>/g, "").replace(/\n\n+/g, "\n\n").trim();
  return { subject: `Re: ${inquiry.subject}`, htmlBody: body, plainBody };
}
