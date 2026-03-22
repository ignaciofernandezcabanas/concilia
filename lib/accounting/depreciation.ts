/**
 * Monthly depreciation runner.
 *
 * For each active fixed asset, calculates the monthly depreciation
 * and creates a journal entry:
 *   Debe: 681 Amortización del inmovilizado material
 *   Haber: 281 Amortización acumulada del inm. material
 */

import { prisma } from "@/lib/db";

export interface DepreciationResult {
  assetsProcessed: number;
  entriesCreated: number;
  totalDepreciation: number;
  errors: Array<{ assetId: string; error: string }>;
}

export async function runMonthlyDepreciation(
  companyId: string,
  year: number,
  month: number
): Promise<DepreciationResult> {
  const result: DepreciationResult = {
    assetsProcessed: 0,
    entriesCreated: 0,
    totalDepreciation: 0,
    errors: [],
  };

  const assets = await prisma.fixedAsset.findMany({
    where: { companyId, status: "ACTIVE" },
    include: {
      depreciationAccount: { select: { id: true, code: true } },
      accumDepAccount: { select: { id: true, code: true } },
    },
  });

  // Get next journal entry number
  const lastEntry = await prisma.journalEntry.findFirst({
    where: { companyId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let nextNumber = (lastEntry?.number ?? 0) + 1;

  const depDate = new Date(year, month - 1, 28); // Use 28th to be safe in all months

  for (const asset of assets) {
    try {
      // Skip if already depreciated this month
      if (
        asset.lastDepreciationDate &&
        asset.lastDepreciationDate.getFullYear() === year &&
        asset.lastDepreciationDate.getMonth() + 1 === month
      ) {
        continue;
      }

      // Calculate depreciation amount
      let depAmount = asset.monthlyDepreciation;

      // Check if this would exceed depreciable amount
      const maxRemaining = asset.acquisitionCost - asset.residualValue - asset.accumulatedDepreciation;
      if (maxRemaining <= 0) {
        // Fully depreciated
        await prisma.fixedAsset.update({
          where: { id: asset.id },
          data: { status: "FULLY_DEPRECIATED" },
        });
        continue;
      }

      depAmount = Math.min(depAmount, maxRemaining);
      depAmount = Math.round(depAmount * 100) / 100;

      if (depAmount <= 0) continue;

      // Create journal entry
      await prisma.journalEntry.create({
        data: {
          number: nextNumber++,
          date: depDate,
          description: `Amortización mensual: ${asset.name} (${month}/${year})`,
          type: "AUTO_DEPRECIATION",
          status: "POSTED",
          sourceType: "depreciation",
          sourceId: asset.id,
          postedAt: new Date(),
          companyId,
          lines: {
            create: [
              {
                debit: depAmount,
                credit: 0,
                accountId: asset.depreciationAccount.id,
                description: `Amort. ${asset.name}`,
              },
              {
                debit: 0,
                credit: depAmount,
                accountId: asset.accumDepAccount.id,
                description: `Amort. acum. ${asset.name}`,
              },
            ],
          },
        },
      });

      // Update asset
      const newAccumDep = Math.round((asset.accumulatedDepreciation + depAmount) * 100) / 100;
      const newNBV = Math.round((asset.acquisitionCost - newAccumDep) * 100) / 100;
      const isFullyDepreciated = newAccumDep >= asset.acquisitionCost - asset.residualValue - 0.01;

      await prisma.fixedAsset.update({
        where: { id: asset.id },
        data: {
          accumulatedDepreciation: newAccumDep,
          netBookValue: Math.max(newNBV, asset.residualValue),
          lastDepreciationDate: depDate,
          status: isFullyDepreciated ? "FULLY_DEPRECIATED" : "ACTIVE",
        },
      });

      result.entriesCreated++;
      result.totalDepreciation += depAmount;
      result.assetsProcessed++;
    } catch (err) {
      result.errors.push({
        assetId: asset.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
