/**
 * Daily Briefing Generator.
 *
 * Uses Opus to synthesize a 1-page briefing in Spanish.
 * v2: includes consolidation KPIs (NCI, IC eliminations, per-subsidiary results).
 */

import { callAI } from "@/lib/ai/model-router";
import { DAILY_BRIEFING } from "@/lib/ai/prompt-registry";
import type { Anomaly } from "./anomaly-detector";

export interface AgentRunMetrics {
  companiesProcessed: number;
  txsProcessed: number;
  txsAutoExecuted: number;
  txsToBandeja: number;
  llmCallsTotal: number;
  errorsCount: number;
  stepErrors: string[];
}

export interface ForecastWeekSummary {
  weekStart: string;
  projectedBalance: number;
}

export interface CompanyConsolidationSummary {
  id: string;
  name: string;
  consolidationMethod: string;
  ownershipPercentage: number;
  resultado: number;
  functionalCurrency: string;
}

export interface ConsolidationContext {
  companies: CompanyConsolidationSummary[];
  consolidatedResultado: number;
  nciAmount: number;
  pendingEliminations: number;
  pendingEliminationsAmount: number;
  hasFxExposure: boolean;
}

export async function generateDailyBriefing(
  orgName: string,
  runMetrics: AgentRunMetrics,
  forecast: ForecastWeekSummary[] | null,
  anomalies: Anomaly[],
  bandejaCount: number,
  closeProposal: string | null,
  consolidation?: ConsolidationContext | null
): Promise<string | null> {
  const metricsJson = JSON.stringify({
    ...runMetrics,
    closeProposal: closeProposal ? "Generada" : "N/A",
  });

  const forecastJson = forecast
    ? JSON.stringify(forecast.slice(0, 4))
    : "Sin datos de previsión.";

  const anomaliesJson = anomalies.length > 0
    ? JSON.stringify(anomalies.map((a) => ({
        company: a.companyName,
        account: `${a.accountCode} ${a.accountName}`,
        zScore: a.zScore,
        current: a.currentAmount,
        avg: a.avgAmount,
        explanation: a.explanation?.slice(0, 100),
      })))
    : "Sin anomalías detectadas.";

  // Build consolidation context for Opus
  let consolidationJson: string | undefined;
  if (consolidation && consolidation.companies.length > 1) {
    consolidationJson = JSON.stringify({
      perSubsidiaria: consolidation.companies.map((c) => ({
        nombre: c.name,
        metodo: c.consolidationMethod,
        participacion: `${c.ownershipPercentage}%`,
        resultado: c.resultado,
        moneda: c.functionalCurrency,
      })),
      resultadoConsolidado: consolidation.consolidatedResultado,
      interesesMinoritarios: consolidation.nciAmount,
      eliminacionesPendientes: consolidation.pendingEliminations,
      importeEliminaciones: consolidation.pendingEliminationsAmount,
      exposicionFX: consolidation.hasFxExposure ? "Sí — revisar tipo de cambio" : "No",
    });
  }

  return callAI(
    "daily_briefing",
    DAILY_BRIEFING.system,
    DAILY_BRIEFING.buildUser({
      orgName,
      metricsJson,
      forecastJson,
      anomaliesJson,
      bandejaCount,
      fiscalJson: "{}",
      consolidationJson,
    })
  );
}
