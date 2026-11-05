/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestReport.ts aggregates test results, evidence, and repair recommendations
 * into a combined, deterministic, JSON-serializable QA report.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { TestResult } from './TestResult';
import type { TestEvidence } from './TestingTypes';

/** Aggregate summary of a QA report. */
export interface QAReportSummary {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly warnings: number;
  readonly evidenceCount: number;
  readonly success: boolean;
}

/** Repair recommendation surfaced by the report. */
export interface QARepairRecommendation {
  readonly testId: string;
  readonly description: string;
  readonly severity: string;
}

/** JSON-serializable snapshot of a QA report. */
export interface QAReportData {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly results: readonly TestResult[];
  readonly evidence: readonly TestEvidence[];
  readonly repairRecommendations: readonly QARepairRecommendation[];
  readonly summary: QAReportSummary;
}

/** Options for report export. */
export interface QAReportExportOptions {
  timestamp?: string;
  pretty?: boolean;
}

/**
 * Builder-style aggregate QA report.
 * Composition-friendly: instantiate one per QA session.
 */
export class QATestReport {
  readonly reportId: string;
  private readonly results: TestResult[] = [];
  private readonly evidence: TestEvidence[] = [];

  constructor(reportId?: string) {
    this.reportId = reportId ?? `qa_report_${Date.now().toString(36)}`;
  }

  /** Append a test result. */
  addResult(result: TestResult): void { this.results.push(result); }

  /** Append several test results. */
  addResults(results: readonly TestResult[]): void {
    for (const r of results) this.results.push(r);
  }

  /** Append externally supplied evidence. */
  addEvidence(ev: TestEvidence): void { this.evidence.push(ev); }

  /** Append several evidence entries. */
  addAllEvidence(entries: readonly TestEvidence[]): void {
    for (const e of entries) this.evidence.push(e);
  }

  /** All recorded results, in recording order. */
  getResults(): readonly TestResult[] { return [...this.results]; }

  /** All collected evidence, in recording order. */
  getEvidence(): readonly TestEvidence[] { return [...this.evidence]; }

  /** Derive repair recommendations from failed tests. */
  getRepairRecommendations(): readonly QARepairRecommendation[] {
    return this.results
      .filter((r) => r.status === 'FAILED')
      .map((r) => ({
        testId: r.testId,
        description: r.errors.length > 0 ? r.errors[0] : 'Test failed; review required.',
        severity: r.severity,
      }));
  }

  /** Compute aggregate summary. */
  getSummary(): QAReportSummary {
    let passed = 0; let failed = 0; let skipped = 0; let warnings = 0;
    for (const r of this.results) {
      if (r.status === 'PASSED') passed += 1;
      else if (r.status === 'FAILED') failed += 1;
      else if (r.status === 'SKIPPED') skipped += 1;
      warnings += r.warnings.length;
    }
    return {
      totalTests: this.results.length,
      passed, failed, skipped, warnings,
      evidenceCount: this.evidence.length,
      success: failed === 0,
    };
  }

  /** True when no test failed. */
  isSuccessful(): boolean { return this.getSummary().success; }

  /** Return a plain, JSON-serializable snapshot. */
  toJSON(options: QAReportExportOptions = {}): Readonly<QAReportData> {
    return {
      reportId: this.reportId,
      generatedAt: options.timestamp ?? new Date().toISOString(),
      results: this.getResults(),
      evidence: this.getEvidence(),
      repairRecommendations: this.getRepairRecommendations(),
      summary: this.getSummary(),
    };
  }

  /** Serialize the report to a deterministic JSON string. */
  serialize(options: QAReportExportOptions = {}): string {
    return JSON.stringify(this.toJSON(options), null, options.pretty === false ? 0 : 2);
  }

  /** Render a compact, human-readable summary. */
  format(): string {
    const s = this.getSummary();
    const lines: string[] = [`=== QA Report (${this.reportId}) ===`];
    for (const r of this.results) {
      lines.push(`  [${r.status}] ${r.testId}`);
      for (const e of r.errors) lines.push(`      ERROR: ${e}`);
    }
    lines.push(`  -> ${s.passed}/${s.totalTests} passed, ${s.failed} failed, ${s.warnings} warnings`);
    return lines.join('\n');
  }
}
