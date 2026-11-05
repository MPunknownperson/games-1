/**
 * PRESERVE Authoring System — Validation System.
 *
 * ValidationReport.ts aggregates every {@link ValidationResult} from one run
 * into a combined, deterministic, JSON-serializable report.
 *
 * Determinism: results are emitted in the order validators executed, and
 * `serialize()` sorts nothing implicitly, so identical input always produces
 * identical output. Callers may supply a fixed timestamp for byte-stable JSON.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ValidationResult } from './ValidationResult';
import type { ValidationIssue } from './ValidatorTypes';

/** Aggregate counts and timing across a whole validation run. */
export interface ValidationReportSummary {
  /** Number of validators executed. */
  readonly totalValidators: number;
  /** Validators that produced no errors. */
  readonly passedValidators: number;
  /** Validators that produced at least one error. */
  readonly failedValidators: number;
  /** Total `ERROR`-severity findings across all validators. */
  readonly errors: number;
  /** Total `WARNING`-severity findings across all validators. */
  readonly warnings: number;
  /** Total `INFO`-severity findings across all validators. */
  readonly info: number;
  /** Total wall-clock milliseconds for the run. */
  readonly executionTime: number;
  /** True when no validator reported an error. */
  readonly success: boolean;
}

/** Fully serializable snapshot of a validation run. */
export interface ValidationReportData {
  readonly title: string;
  readonly generatedAt: string;
  readonly results: readonly ValidationResult[];
  readonly summary: ValidationReportSummary;
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
 * Composition-friendly: the runner creates one per validation pass.
 */
export class ValidationReport {
  readonly title: string;
  private readonly results: ValidationResult[] = [];
  private totalExecutionTime = 0;

  constructor(title = 'Validation Report') {
    this.title = title;
  }

  /** Append one validator result. */
  add(result: ValidationResult): void {
    this.results.push(result);
    this.totalExecutionTime += result.executionTime;
  }

  /** Every recorded result, in execution order. */
  getResults(): readonly ValidationResult[] {
    return [...this.results];
  }

  /** Every issue from every validator, flattened in execution order. */
  getAllIssues(): readonly ValidationIssue[] {
    const all: ValidationIssue[] = [];
    for (const result of this.results) all.push(...result.issues);
    return all;
  }

  /** Compute aggregate counts and timing. */
  getSummary(): ValidationReportSummary {
    let passed = 0;
    let errors = 0;
    let warnings = 0;
    let info = 0;
    for (const result of this.results) {
      if (result.passed) passed += 1;
      errors += result.errorCount;
      warnings += result.warningCount;
      info += result.infoCount;
    }
    return {
      totalValidators: this.results.length,
      passedValidators: passed,
      failedValidators: this.results.length - passed,
      errors,
      warnings,
      info,
      executionTime: this.totalExecutionTime,
      success: errors === 0,
    };
  }

  /** True when the run produced no errors. */
  isSuccessful(): boolean {
    return this.getSummary().success;
  }

  /** Return a plain, JSON-serializable snapshot. */
  toJSON(options: ReportExportOptions = {}): ValidationReportData {
    return {
      title: this.title,
      generatedAt: options.timestamp ?? new Date().toISOString(),
      results: this.getResults(),
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
    const lines: string[] = [`=== ${this.title} ===`];
    for (const result of this.results) {
      const mark = result.passed ? 'PASS' : 'FAIL';
      lines.push(`  [${mark}] ${result.validatorName} (${result.executionTime.toFixed(2)}ms)`);
      for (const issue of result.issues) {
        const where = formatLocation(issue);
        lines.push(`      ${issue.severity} ${issue.id}${where}: ${issue.message}`);
        if (issue.suggestion) lines.push(`         hint: ${issue.suggestion}`);
      }
    }
    lines.push(
      `  -> ${summary.passedValidators}/${summary.totalValidators} validators passed, ` +
        `${summary.errors} error(s), ${summary.warnings} warning(s), ` +
        `${summary.info} info, ${summary.executionTime.toFixed(2)}ms`,
    );
    return lines.join('\n');
  }
}

/** Render an issue location as a bracketed suffix, or an empty string. */
function formatLocation(issue: ValidationIssue): string {
  const loc = issue.location;
  if (!loc) return '';
  const parts: string[] = [];
  if (loc.file) parts.push(loc.file);
  if (loc.path) parts.push(loc.path);
  if (loc.line !== undefined) {
    parts.push(loc.column !== undefined ? `${loc.line}:${loc.column}` : `line ${loc.line}`);
  }
  return parts.length > 0 ? ` [${parts.join(' ')}]` : '';
}
