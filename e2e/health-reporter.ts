import type { Reporter, TestCase, TestResult, FullResult } from "@playwright/test/reporter";
import * as fs from "fs";

interface SectionStats {
  passed: number;
  failed: number;
  total: number;
}

class HealthReporter implements Reporter {
  private results = new Map<string, SectionStats>();

  onTestEnd(test: TestCase, result: TestResult) {
    const section = this.getSection(test.location.file);
    const current = this.results.get(section) ?? {
      passed: 0,
      failed: 0,
      total: 0,
    };
    current.total++;
    if (result.status === "passed" || result.status === "skipped") {
      current.passed++;
    } else {
      current.failed++;
    }
    this.results.set(section, current);
  }

  onEnd(_result: FullResult) {
    let totalPassed = 0;
    let totalTests = 0;
    const sections: Record<string, { passed: number; total: number; score: number }> = {};

    console.log("\n═══════════════════════════════════════");
    console.log("  CONCILIA — HEALTH SCORE REPORT");
    console.log("═══════════════════════════════════════\n");

    for (const [section, data] of this.results) {
      const score = data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0;
      sections[section] = { passed: data.passed, total: data.total, score };
      totalPassed += data.passed;
      totalTests += data.total;
      const icon = score === 100 ? "✅" : score >= 80 ? "⚠️" : "❌";
      console.log(`  ${icon} ${section}: ${data.passed}/${data.total} (${score}%)`);
    }

    const overallScore = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    console.log(`\n  📊 OVERALL: ${totalPassed}/${totalTests} — ${overallScore}%`);
    console.log("═══════════════════════════════════════\n");

    fs.mkdirSync("e2e-results", { recursive: true });
    fs.writeFileSync(
      "e2e-results/health-score.json",
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          overallScore,
          totalPassed,
          totalTests,
          sections,
        },
        null,
        2
      )
    );
  }

  private getSection(file: string): string {
    if (file.includes("/auth/")) return "Auth";
    if (file.includes("/smoke/")) return "Smoke";
    if (file.includes("/navigation/")) return "Navigation";
    if (file.includes("/crud/")) return "CRUD";
    if (file.includes("/validation/")) return "Validation";
    if (file.includes("/responsive/")) return "Responsive";
    if (file.includes("/diario/")) return "Diario";
    if (file.includes("/contabilidad/")) return "Contabilidad";
    if (file.includes("/reporting/")) return "Reporting";
    if (file.includes("/sistema/")) return "Sistema";
    if (file.includes("/public/")) return "Public";
    if (file.includes("/api/")) return "API";
    return "Other";
  }
}

export default HealthReporter;
