/**
 * PRESERVE Authoring System — testing infrastructure.
 *
 * TestReport.ts accumulates per-test results and warnings, measures execution
 * time, and produces a structured report that is serializable to JSON.
 *
 * Development-only; never imported by the runtime game.
 */
import type { TestStatus } from './AuthoringTest';

/** The recorded outcome of a single test. */
export interface TestResultRecord {
  name: string;
  description?: string;
  expected?: string;
  status: TestStatus;
  /** Wall-clock time spent executing the test, in milliseconds. */
  durationMs: number;
  /** Failure message when `status` is 'failed'. */
  error?: string;
  /** Reason when `status` is 'skipped'. */
  skipReason?: string;
}

/** Aggregate counts and timing for the whole run. */
export interface TestReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  warnings: string[];
  /** Total wall-clock time for the run, in milliseconds. */
  totalDurationMs: number;
  /** True when no test failed. */
  success: boolean;
}

/** Fully serializable shape of a report. */
export interface TestReportData {
  title: string;
  startedAt: string;
  finishedAt?: string;
  results: TestResultRecord[];
  summary: TestReportSummary;
}

/** High-resolution timestamp in milliseconds, with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Builder-style report. The runner calls `begin`, `record`, `addWarning`, and
 * `finish`, then reads the summary or serializes the whole report.
 */
export class TestReport {
  readonly title: string;
  private readonly results: TestResultRecord[] = [];
  private readonly warnings: string[] = [];
  private startedAt?: string;
  private finishedAt?: string;
  private startedAtMs?: number;
  private totalDurationMs = 0;

  constructor(title = 'Authoring Test Report') {
    this.title = title;
  }

  /** Mark the start of the run. */
  begin(): void {
    this.startedAt = new Date().toISOString();
    this.startedAtMs = nowMs();
  }

  /** Append a single test result. */
  record(result: TestResultRecord): void {
    this.results.push(result);
  }

  /** Record a run-level warning. */
  addWarning(message: string): void {
    this.warnings.push(message);
  }

  /** Mark the end of the run and compute total duration. */
  finish(): void {
    this.finishedAt = new Date().toISOString();
    this.totalDurationMs = this.startedAtMs !== undefined ? nowMs() - this.startedAtMs : 0;
  }

  /** Compute the aggregate summary. */
  getSummary(): TestReportSummary {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    for (const result of this.results) {
      if (result.status === 'passed') passed += 1;
      else if (result.status === 'failed') failed += 1;
      else skipped += 1;
    }
    return {
      total: this.results.length,
      passed,
      failed,
      skipped,
      warnings: [...this.warnings],
      totalDurationMs: this.totalDurationMs,
      success: failed === 0,
    };
  }

  /** Return a plain, JSON-serializable object. */
  toJSON(): TestReportData {
    return {
      title: this.title,
      startedAt: this.startedAt ?? new Date().toISOString(),
      finishedAt: this.finishedAt,
      results: [...this.results],
      summary: this.getSummary(),
    };
  }

  /** Serialize the report to a JSON string. */
  serialize(pretty = true): string {
    return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0);
  }

  /** Print a compact, human-readable summary to the console (dev only). */
  print(): void {
    const s = this.getSummary();
    console.log(`\n=== ${this.title} ===`);
    for (const r of this.results) {
      const mark = r.status === 'passed' ? 'PASS' : r.status === 'failed' ? 'FAIL' : 'SKIP';
      console.log(`  [${mark}] ${r.name} (${r.durationMs.toFixed(2)}ms)`);
      if (r.error) console.log(`        ${r.error}`);
      if (r.skipReason) console.log(`        skipped: ${r.skipReason}`);
    }
    console.log(
      `  -> ${s.passed}/${s.total} passed, ${s.failed} failed, ${s.skipped} skipped, ` +
        `${s.warnings.length} warnings, ${s.totalDurationMs.toFixed(2)}ms`,
    );
  }
}
