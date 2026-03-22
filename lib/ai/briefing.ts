/**
 * Daily Briefing Generator.
 *
 * Uses Opus to synthesize a 1-page briefing in Spanish.
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

export async function generateDailyBriefing(
  orgName: string,
  runMetrics: AgentRunMetrics,
  forecast: ForecastWeekSummary[] | null,
  anomalies: Anomaly[],
  bandejaCount: number,
  closeProposal: string | null
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
    })
  );
}
