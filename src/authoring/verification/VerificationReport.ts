/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationReport.ts aggregates rule results into a combined, deterministic,
 * JSON-serializable report and derives repair suggestions for every finding.
 *
 * Determinism: results are recorded in execution order and never re-sorted
 * implicitly. Callers may supply a fixed timestamp for byte-stable output.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { suggestRepairs, type RepairSuggestion } from './RepairSuggestion';
import { allFindings, type VerificationResult } from './VerificationResult';
import { VerificationStatus, type VerificationIssue } from './VerificationTypes';

/** Aggregate counts and timing across a whole verification pass. */
export interface VerificationReportSummary {
  /** Number of rule executions recorded. */
  readonly totalChecks: number;
  /** Executions that produced no errors. */
  readonly passedChecks: number;
  /** Executions that produced at least one error. */
  readonly failedChecks: number;
  /** Executions that were skipped. */
  readonly skippedChecks: number;
  /** Total `ERROR`-severity findings. */
  readonly errors: number;
  /** Total `WARNING`-severity findings. */
  readonly warnings: number;
  /** Total `INFO`-severity findings. */
  readonly info: number;
  /** Total wall-clock milliseconds. */
  readonly durationMs: number;
  /** True when no execution reported an error. */
  readonly success: boolean;
}

/** Fully serializable snapshot of a verification pass. */
export interface VerificationReportData {
  readonly title: string;
  readonly projectVersion: string;
  readonly generatedAt: string;
  readonly results: readonly VerificationResult[];
  readonly failedResults: readonly VerificationResult[];
  readonly repairSuggestions: readonly RepairSuggestion[];
  readonly summary: VerificationReportSummary;
}

/** Options controlling report export. */
export interface ReportExportOptions {
  /** Fixed ISO-8601 timestamp, making the export byte-stable. */
  timestamp?: string;
  /** Pretty-print the JSON output. Defaults to true. */
  pretty?: boolean;
}

/**
 * Builder-style aggregate report.
 * Composition-friendly: the runner creates one per verification pass.
 */
export class VerificationReport {
  readonly title: string;
  readonly projectVersion: string;
  private readonly results: VerificationResult[] = [];
  private totalDurationMs = 0;

  constructor(title = 'Verification Report', projectVersion = '0.0.0') {
    this.title = title;
    this.projectVersion = projectVersion;
  }

  /** Append one rule result. */
  add(result: VerificationResult): void {
    this.results.push(result);
    this.totalDurationMs += result.durationMs;
  }

  /** Every recorded result, in execution order. */
  getResults(): readonly VerificationResult[] {
    return [...this.results];
  }

  /** Only the results that reported at least one error. */
  getFailedResults(): readonly VerificationResult[] {
    return this.results.filter((result) => !result.passed);
  }

  /** Every finding from every rule, flattened in execution order. */
  getAllIssues(): readonly VerificationIssue[] {
    const all: VerificationIssue[] = [];
    for (const result of this.results) all.push(...allFindings(result));
    return all;
  }

  /** Repair suggestions derived from every error and warning. */
  getRepairSuggestions(): readonly RepairSuggestion[] {
    const actionable: VerificationIssue[] = [];
    for (const result of this.results) {
      actionable.push(...result.issues, ...result.warnings);
    }
    return suggestRepairs(actionable);
  }

  /** Compute aggregate counts and timing. */
  getSummary(): VerificationReportSummary {
    let passed = 0;
    let skipped = 0;
    let errors = 0;
    let warnings = 0;
    let info = 0;
    for (const result of this.results) {
      if (result.status === VerificationStatus.SKIPPED) skipped += 1;
      else if (result.passed) passed += 1;
      errors += result.issues.length;
      warnings += result.warnings.length;
      info += result.info.length;
    }
    return {
      totalChecks: this.results.length,
      passedChecks: passed,
      failedChecks: this.results.length - passed - skipped,
      skippedChecks: skipped,
      errors,
      warnings,
      info,
      durationMs: this.totalDurationMs,
      success: errors === 0,
    };
  }

  /** True when the pass produced no errors. */
  isSuccessful(): boolean {
    return this.getSummary().success;
  }

  /** Return a plain, JSON-serializable snapshot. */
  toJSON(options: ReportExportOptions = {}): VerificationReportData {
    return {
      title: this.title,
      projectVersion: this.projectVersion,
      generatedAt: options.timestamp ?? new Date().toISOString(),
      results: this.getResults(),
      failedResults: this.getFailedResults(),
      repairSuggestions: this.getRepairSuggestions(),
      summary: this.getSummary(),
    };
  }

  /** Serialize the report to a deterministic JSON string. */
  serialize(options: ReportExportOptions = {}): string {
    return JSON.stringify(this.toJSON(options), null, options.pretty === false ? 0 : 2);
  }

  /** Render a compact, human-readable summary suitable for logs. */
  format(): string {
    const summary = this.getSummary();
    const lines: string[] = [`=== ${this.title} (v${this.projectVersion}) ===`];
    for (const result of this.results) {
      const mark = result.status === VerificationStatus.SKIPPED ? 'SKIP' : result.passed ? 'PASS' : 'FAIL';
      lines.push(`  [${mark}] ${result.ruleId} @ ${result.targetLabel} (${result.durationMs.toFixed(2)}ms)`);
      for (const finding of allFindings(result)) {
        const where = finding.location?.line !== undefined ? `:${finding.location.line}` : '';
        lines.push(`      ${finding.severity} ${finding.code}${where}: ${finding.message}`);
      }
    }
    lines.push(
      `  -> ${summary.passedChecks}/${summary.totalChecks} passed, ${summary.errors} error(s), ` +
        `${summary.warnings} warning(s), ${summary.durationMs.toFixed(2)}ms`,
    );
    return lines.join('\n');
  }
}
