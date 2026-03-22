import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withCronAuth } from "@/lib/auth/cron-guard";

/**
 * POST /api/cron/calibrate-thresholds
 * Protected by QStash signature or CRON_SECRET.
 *
 * Monthly cron that recalibrates auto-approval thresholds per category.
 *
 * Logic:
 * - For each category, look at last month's decisions
 * - autoApprovedCount: items that were auto-approved
 * - autoApprovedErrors: auto-approved items later corrected by controller
 * - manualApprovedCount: items in bandeja that controller approved WITHOUT changes
 * - manualRejectedCount: items in bandeja that controller rejected/modified
 *
 * Rules:
 * - If autoApprovedErrors > 0 → RAISE threshold by 5%
 * - If autoApprovedErrors = 0 for 3+ months AND manualApproved > 10% of bandeja → LOWER by 2%
 * - Never go below 0.50 or above 0.99
 */
export const POST = withCronAuth(async (_req: NextRequest) => {
  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
    const periodStart = lastMonth;
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const companies = await prisma.company.findMany({ select: { id: true, autoApproveThreshold: true } });

    for (const company of companies) {
      const categories = ["EXACT_MATCH", "GROUPED_MATCH", "DIFFERENCE_MATCH", "CLASSIFICATION"];

      for (const category of categories) {
        // Count auto-approved reconciliations in this category
        const autoApproved = await prisma.reconciliation.count({
          where: {
            companyId: company.id,
            status: "AUTO_APPROVED",
            createdAt: { gte: periodStart, lte: periodEnd },
            type: category as import("@prisma/client").ReconciliationType,
          },
        });

        // Count auto-approved that were later corrected (rejected after auto-approve)
        const autoErrors = await prisma.controllerDecision.count({
          where: {
            companyId: company.id,
            createdAt: { gte: periodStart, lte: periodEnd },
            wasModified: true,
            systemConfidence: { gte: company.autoApproveThreshold },
          },
        });

        // Count items that went to bandeja and controller approved without changes
        const manualApproved = await prisma.controllerDecision.count({
          where: {
            companyId: company.id,
            createdAt: { gte: periodStart, lte: periodEnd },
            controllerAction: "approve",
            wasModified: false,
          },
        });

        const manualRejected = await prisma.controllerDecision.count({
          where: {
            companyId: company.id,
            createdAt: { gte: periodStart, lte: periodEnd },
            wasModified: true,
          },
        });

        // Get previous calibration to check consecutive error-free months
        const prevCalibration = await prisma.thresholdCalibration.findFirst({
          where: {
            companyId: company.id,
            category,
            period: { not: period },
          },
          orderBy: { period: "desc" },
        });

        const monthsNoError = autoErrors === 0
          ? (prevCalibration?.monthsNoError ?? 0) + 1
          : 0;

        // Calculate suggested threshold
        let suggested = company.autoApproveThreshold;
        if (autoErrors > 0) {
          // Errors detected → raise threshold (more conservative)
          suggested = Math.min(0.99, suggested + 0.05);
        } else if (monthsNoError >= 3 && manualApproved > (manualApproved + manualRejected) * 0.1) {
          // 3+ months no errors AND >10% of bandeja was approved unchanged → lower threshold
          suggested = Math.max(0.50, suggested - 0.02);
        }

        // Update CategoryThreshold if suggestion differs from current
        if (suggested !== company.autoApproveThreshold) {
          await prisma.categoryThreshold.upsert({
            where: {
              companyId_category: { companyId: company.id, category },
            },
            create: { companyId: company.id, category, threshold: suggested },
            update: { threshold: suggested },
          });
        }

        // Store calibration record (history)
        await prisma.thresholdCalibration.upsert({
          where: {
            companyId_category_period: {
              companyId: company.id,
              category,
              period,
            },
          },
          create: {
            companyId: company.id,
            category,
            period,
            currentThreshold: company.autoApproveThreshold,
            suggestedThreshold: suggested !== company.autoApproveThreshold ? suggested : null,
            autoApprovedCount: autoApproved,
            autoApprovedErrors: autoErrors,
            manualApprovedCount: manualApproved,
            manualRejectedCount: manualRejected,
            monthsNoError,
            lastCalibratedAt: now,
          },
          update: {
            currentThreshold: company.autoApproveThreshold,
            suggestedThreshold: suggested !== company.autoApproveThreshold ? suggested : null,
            autoApprovedCount: autoApproved,
            autoApprovedErrors: autoErrors,
            manualApprovedCount: manualApproved,
            manualRejectedCount: manualRejected,
            monthsNoError,
            lastCalibratedAt: now,
          },
        });
      }
    }

    return NextResponse.json({ success: true, period });
  } catch (err) {
    console.error("[cron/calibrate-thresholds] Error:", err);
    return errorResponse("Calibration failed.", err, 500);
  }
});
