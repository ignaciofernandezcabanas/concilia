/**
 * Response Evaluation Engine.
 *
 * Evaluates email responses to inquiries in 3 phases:
 * 1. Attachment analysis (deterministic + Haiku PDF extraction)
 * 2. Text classification (Sonnet with CoT)
 * 3. Action decision (deterministic rules)
 */

import { callAIJson } from "@/lib/ai/model-router";
import { EVALUATE_INQUIRY_RESPONSE } from "@/lib/ai/prompt-registry";
import { extractInvoiceFromPdf } from "@/lib/invoices/pdf-extractor";
import type { InquiryTrigger, ResponseType, ProposedAction } from "@prisma/client";

// ── Types ──

export interface AttachmentAnalysis {
  count: number;
  types: string[];
  hasInvoicePdf: boolean;
  hasContract: boolean;
  hasDeliveryNote: boolean;
}

export interface DocumentValidation {
  matchesRequestedType: boolean;
  amountMatch: "exact" | "close" | "different" | "not_found";
  dateMatch: "exact" | "close" | "different" | "not_found";
  contactMatch: boolean;
  invoiceNumberFound: string | null;
  extractedAmount: number | null;
  extractedDate: string | null;
  issues: string[];
}

export interface TextAnalysis {
  responseType: ResponseType;
  sentiment: "cooperative" | "neutral" | "reluctant" | "hostile";
  promisedDeliveryDate: string | null;
  redirectContact: { name: string | null; email: string | null; department: string | null } | null;
  questionAsked: string | null;
  disputeReason: string | null;
  summary: string;
}

export interface ResponseEvaluation {
  responseType: ResponseType;
  confidence: number;
  attachments: AttachmentAnalysis;
  documentValidation: DocumentValidation | null;
  textAnalysis: TextAnalysis;
  proposedAction: ProposedAction;
  proposedActionReason: string;
  waitUntilDate: string | null;
}

// ── Main evaluator ──

export async function evaluateResponse(params: {
  inquiry: {
    triggerType: InquiryTrigger;
    subject: string;
    contactId: string;
  };
  responseEmail: {
    from: string;
    subject: string;
    body: string;
    attachments: Array<{ filename: string; mimeType: string; size: number; content?: Buffer }>;
  };
  originalRequest: {
    triggerType: InquiryTrigger;
    bankTransaction?: { amount: number; valueDate: string; concept: string };
    invoice?: { number: string; amount: number; date: string };
    contactName?: string;
    contactCif?: string;
  };
}): Promise<ResponseEvaluation> {
  // Phase 1: Analyze attachments
  const attachmentResult = await analyzeAttachments(
    params.responseEmail.attachments,
    params.originalRequest
  );

  // Phase 2: Classify text
  const textResult = await classifyResponseText(
    params.inquiry,
    params.responseEmail,
    attachmentResult,
    params.originalRequest
  );

  // Phase 3: Decide action
  const { action, reason, waitUntilDate } = decideAction(
    attachmentResult,
    textResult,
    params.inquiry.triggerType
  );

  // Determine final responseType (prefer attachment-based if document found)
  const responseType = attachmentResult.hasInvoicePdf
    ? ("DOCUMENT_ATTACHED" as ResponseType)
    : textResult.responseType;

  const confidence = attachmentResult.hasInvoicePdf
    ? attachmentResult.documentValidation?.amountMatch === "exact"
      ? 0.95
      : 0.8
    : textResult.responseType === "UNCLEAR"
      ? 0.3
      : 0.7;

  return {
    responseType,
    confidence,
    attachments: {
      count: attachmentResult.count,
      types: attachmentResult.types,
      hasInvoicePdf: attachmentResult.hasInvoicePdf,
      hasContract: attachmentResult.hasContract,
      hasDeliveryNote: attachmentResult.hasDeliveryNote,
    },
    documentValidation: attachmentResult.documentValidation,
    textAnalysis: textResult,
    proposedAction: action,
    proposedActionReason: reason,
    waitUntilDate,
  };
}

// ── Phase 1: Attachment analysis ──

interface AttachmentResult extends AttachmentAnalysis {
  documentValidation: DocumentValidation | null;
  invoicePdfBuffer: Buffer | null;
}

async function analyzeAttachments(
  attachments: Array<{ filename: string; mimeType: string; size: number; content?: Buffer }>,
  original: {
    bankTransaction?: { amount: number; valueDate: string };
    invoice?: { number: string; amount: number; date: string };
    contactName?: string;
    contactCif?: string;
  }
): Promise<AttachmentResult> {
  const result: AttachmentResult = {
    count: 0,
    types: [],
    hasInvoicePdf: false,
    hasContract: false,
    hasDeliveryNote: false,
    documentValidation: null,
    invoicePdfBuffer: null,
  };

  // Filter out signatures, calendar events, embedded images
  const relevant = attachments.filter((a) => {
    const name = a.filename.toLowerCase();
    if (name.endsWith(".sig") || name.endsWith(".ics") || name.endsWith(".vcf")) return false;
    if (a.mimeType.startsWith("image/") && a.size < 10000) return false; // likely logo
    return true;
  });

  result.count = relevant.length;
  result.types = Array.from(new Set(relevant.map((a) => a.filename.split(".").pop() ?? "unknown")));

  // Analyze PDFs
  for (const att of relevant) {
    if (!att.mimeType.includes("pdf") || !att.content) continue;

    try {
      const extracted = await extractInvoiceFromPdf(att.content, att.filename);
      if (!extracted) continue;

      // Detect document type by content
      const isInvoice = extracted.totalAmount != null && (extracted.confidence ?? 0) >= 0.5;
      if (isInvoice) {
        result.hasInvoicePdf = true;
        result.invoicePdfBuffer = att.content;

        // Validate against original
        const expectedAmount = original.bankTransaction?.amount ?? original.invoice?.amount;
        const expectedDate = original.bankTransaction?.valueDate ?? original.invoice?.date;
        const issues: string[] = [];

        let amountMatch: DocumentValidation["amountMatch"] = "not_found";
        if (extracted.totalAmount != null && expectedAmount != null) {
          const diff = Math.abs(Math.abs(extracted.totalAmount) - Math.abs(expectedAmount));
          const pct = diff / Math.abs(expectedAmount);
          if (diff < 0.05) amountMatch = "exact";
          else if (pct < 0.05) amountMatch = "close";
          else {
            amountMatch = "different";
            issues.push(
              `Importe: factura ${extracted.totalAmount}€ vs movimiento ${Math.abs(expectedAmount)}€`
            );
          }
        }

        let dateMatch: DocumentValidation["dateMatch"] = "not_found";
        if (extracted.issueDate && expectedDate) {
          const dDays =
            Math.abs(new Date(extracted.issueDate).getTime() - new Date(expectedDate).getTime()) /
            86400000;
          if (dDays <= 5) dateMatch = "exact";
          else if (dDays <= 60) dateMatch = "close";
          else {
            dateMatch = "different";
            issues.push(`Fecha: factura ${extracted.issueDate} vs movimiento ${expectedDate}`);
          }
        }

        const contactMatch =
          !original.contactCif || !extracted.supplierCif
            ? true // can't verify → assume OK
            : extracted.supplierCif.replace(/[^A-Z0-9]/g, "") ===
              original.contactCif.replace(/[^A-Z0-9]/g, "");

        if (!contactMatch) {
          issues.push(
            `Emisor: factura de ${extracted.supplierName ?? "?"} vs contacto ${original.contactName ?? "?"}`
          );
        }

        result.documentValidation = {
          matchesRequestedType: true,
          amountMatch,
          dateMatch,
          contactMatch,
          invoiceNumberFound: extracted.number ?? null,
          extractedAmount: extracted.totalAmount ?? null,
          extractedDate: extracted.issueDate ?? null,
          issues,
        };
      }
    } catch {
      // PDF parsing failed — not an invoice
    }
  }

  return result;
}

// ── Phase 2: Text classification ──

async function classifyResponseText(
  inquiry: { triggerType: InquiryTrigger; subject: string },
  email: { body: string; subject: string },
  attachments: AttachmentResult,
  original: {
    bankTransaction?: { amount: number; valueDate: string; concept: string };
    invoice?: { number: string; amount: number };
  }
): Promise<TextAnalysis> {
  const aiResult = await callAIJson(
    "evaluate_inquiry_response",
    EVALUATE_INQUIRY_RESPONSE.system,
    EVALUATE_INQUIRY_RESPONSE.buildUser({
      originalSubject: inquiry.subject,
      originalTrigger: inquiry.triggerType,
      responseText: email.body.slice(0, 2000), // limit to 2K chars
      hasAttachments: attachments.count > 0,
      attachmentTypes: attachments.types,
      amountExpected: original.bankTransaction?.amount ?? original.invoice?.amount,
    }),
    EVALUATE_INQUIRY_RESPONSE.schema
  );

  if (aiResult) {
    return {
      responseType: aiResult.responseType as ResponseType,
      sentiment: aiResult.sentiment as TextAnalysis["sentiment"],
      promisedDeliveryDate: aiResult.promisedDeliveryDate ?? null,
      redirectContact: aiResult.redirectContact ?? null,
      questionAsked: aiResult.questionAsked ?? null,
      disputeReason: aiResult.disputeReason ?? null,
      summary: aiResult.summary,
    };
  }

  // Fallback: minimal classification
  return {
    responseType: "UNCLEAR" as ResponseType,
    sentiment: "neutral",
    promisedDeliveryDate: null,
    redirectContact: null,
    questionAsked: null,
    disputeReason: null,
    summary: "No se pudo analizar la respuesta automáticamente.",
  };
}

// ── Phase 3: Action decision (deterministic) ──

function decideAction(
  att: AttachmentResult,
  text: TextAnalysis,
  triggerType: InquiryTrigger
): { action: ProposedAction; reason: string; waitUntilDate: string | null } {
  // CASE 1: Document attached and matches
  if (att.hasInvoicePdf && att.documentValidation) {
    const v = att.documentValidation;
    if (v.amountMatch === "exact" && v.contactMatch) {
      return {
        action: "CLOSE_RESOLVED",
        reason: "Factura recibida, importe coincide exactamente.",
        waitUntilDate: null,
      };
    }
    if (v.amountMatch === "close" && v.contactMatch) {
      return {
        action: "CLOSE_RESOLVED",
        reason: "Factura recibida, diferencia menor del 5% (posible retención/comisión).",
        waitUntilDate: null,
      };
    }
    if (v.amountMatch === "different") {
      return {
        action: "REPLY_REQUEST_CORRECT",
        reason: `Factura recibida pero importe no coincide. ${v.issues.join(". ")}`,
        waitUntilDate: null,
      };
    }
    if (!v.contactMatch) {
      return {
        action: "REPLY_REQUEST_CORRECT",
        reason: "Factura recibida pero parece ser de otro proveedor.",
        waitUntilDate: null,
      };
    }
  }

  // CASE 2: Delivery note but we asked for invoice
  if (att.hasDeliveryNote && triggerType === "MISSING_INVOICE") {
    return {
      action: "REPLY_REQUEST_DOCUMENT",
      reason: "Han enviado un albarán pero necesitamos la factura.",
      waitUntilDate: null,
    };
  }

  // CASE 3: Promise with date
  if (text.responseType === "DOCUMENT_PROMISED" && text.promisedDeliveryDate) {
    const wait = new Date(text.promisedDeliveryDate);
    wait.setDate(wait.getDate() + 2); // +2 days grace
    return {
      action: "WAIT_PROMISED",
      reason: `Prometen enviar el ${text.promisedDeliveryDate}.`,
      waitUntilDate: wait.toISOString().slice(0, 10),
    };
  }

  // CASE 4: Promise without date
  if (text.responseType === "DOCUMENT_PROMISED") {
    return {
      action: "REPLY_REQUEST_DOCUMENT",
      reason: "Prometen enviar pero sin fecha concreta.",
      waitUntilDate: null,
    };
  }

  // CASE 5: Explanation
  if (text.responseType === "EXPLANATION_GIVEN") {
    return {
      action: "ESCALATE_CONTROLLER",
      reason: `Explican: "${text.summary}". Requiere decisión del controller.`,
      waitUntilDate: null,
    };
  }

  // CASE 6: Dispute
  if (text.responseType === "DISPUTE") {
    return {
      action: "ESCALATE_DISPUTE",
      reason: `Disputan: "${text.disputeReason}". Requiere decisión humana.`,
      waitUntilDate: null,
    };
  }

  // CASE 7: Redirect
  if (text.responseType === "REDIRECT" && text.redirectContact?.email) {
    return {
      action: "REPLY_REDIRECT",
      reason: `Redirigen a ${text.redirectContact.name} (${text.redirectContact.email}).`,
      waitUntilDate: null,
    };
  }

  // CASE 8: Question back
  if (text.responseType === "QUESTION_BACK") {
    return {
      action: "REPLY_CLARIFY",
      reason: `Preguntan: "${text.questionAsked}".`,
      waitUntilDate: null,
    };
  }

  // CASE 9: Out of office
  if (text.responseType === "OUT_OF_OFFICE") {
    const wait = new Date();
    wait.setDate(wait.getDate() + 5);
    return {
      action: "WAIT_PROMISED",
      reason: "Respuesta automática de ausencia.",
      waitUntilDate: wait.toISOString().slice(0, 10),
    };
  }

  // CASE 10: Acknowledgment only
  if (text.responseType === "ACKNOWLEDGMENT_ONLY") {
    const wait = new Date();
    wait.setDate(wait.getDate() + 3);
    return {
      action: "WAIT_PROMISED",
      reason: "Solo acusan recibo. Esperar 3 días.",
      waitUntilDate: wait.toISOString().slice(0, 10),
    };
  }

  // DEFAULT: Unclear → escalate
  return {
    action: "ESCALATE_CONTROLLER",
    reason: "No se puede determinar si resuelve la consulta.",
    waitUntilDate: null,
  };
}
