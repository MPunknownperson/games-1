/**
 * PRESERVE Authoring System — testing infrastructure.
 *
 * AuthoringTestRunner.ts executes {@link AuthoringTest} instances, collects
 * their results, measures execution time, and produces a structured
 * {@link TestReport}. It supports running all tests, running a single test by
 * name, and either stopping at the first failure or continuing past failures.
 *
 * Development-only; never imported by the runtime game.
 */
import { createTestContext, TestSkipSignal, type AuthoringTest, type TestStatus } from './AuthoringTest';
import { AssertionFailure } from './AuthoringAssertions';
import { TestReport, type TestResultRecord } from './TestReport';

/** Options controlling runner behavior. */
export interface TestRunnerOptions {
  /** Title applied to the produced report. */
  title?: string;
  /**
   * When true, the run halts immediately after the first failing test.
   * Defaults to `false` (continue on failure).
   */
  stopOnFailure?: boolean;
}

/** High-resolution timestamp in milliseconds, with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Collects and runs authoring tests. Composition-friendly: hold an instance and
 * `add` tests, then `runAll` or `runOne`.
 */
export class AuthoringTestRunner {
  private readonly tests: AuthoringTest[] = [];
  private readonly title: string;
  private readonly stopOnFailure: boolean;

  constructor(options: TestRunnerOptions = {}) {
    this.title = options.title ?? 'Authoring Test Report';
    this.stopOnFailure = options.stopOnFailure ?? false;
  }

  /** Register a test to be run. Returns the runner for chaining. */
  add(test: AuthoringTest): this {
    this.tests.push(test);
    return this;
  }

  /** Number of registered tests. */
  size(): number {
    return this.tests.length;
  }

  /** Run every registered test and return the structured report. */
  async runAll(): Promise<TestReport> {
    return this.run(this.tests);
  }

  /**
   * Run a single test identified by exact name.
   * @throws {Error} when no test with the given name is registered.
   */
  async runOne(name: string): Promise<TestReport> {
    const test = this.tests.find((t) => t.name === name);
    if (!test) {
      throw new Error(`No test named "${name}" is registered.`);
    }
    return this.run([test]);
  }

  /** Execute the supplied tests, honoring stop/continue-on-failure. */
  private async run(selected: AuthoringTest[]): Promise<TestReport> {
    const report = new TestReport(this.title);
    report.begin();
    for (const test of selected) {
      const record = await this.executeOne(test, report);
      report.record(record);
      if (record.status === 'failed' && this.stopOnFailure) {
        report.addWarning(`Run stopped after failure: "${test.name}" (stopOnFailure).`);
        break;
      }
    }
    report.finish();
    return report;
  }

  /** Run one test, timing it and translating outcomes into a record. */
  private async executeOne(test: AuthoringTest, report: TestReport): Promise<TestResultRecord> {
    const base: TestResultRecord = {
      name: test.name,
      description: test.description,
      expected: test.expected,
      status: 'failed',
      durationMs: 0,
    };

    if (test.enabled === false) {
      return { ...base, status: 'skipped', skipReason: 'Disabled via enabled=false.' };
    }

    const warnings: string[] = [];
    const ctx = createTestContext({
      onWarn: (message) => warnings.push(`[${test.name}] ${message}`),
    });

    const started = nowMs();
    try {
      await test.execute(ctx);
      const durationMs = nowMs() - started;
      warnings.forEach((w) => report.addWarning(w));
      return { ...base, status: 'passed', durationMs };
    } catch (error) {
      const durationMs = nowMs() - started;
      warnings.forEach((w) => report.addWarning(w));
      if (error instanceof TestSkipSignal) {
        return { ...base, status: 'skipped', durationMs, skipReason: error.reason };
      }
      const errorMessage =
        error instanceof AssertionFailure
          ? error.message
          : error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
      const status: TestStatus = 'failed';
      return { ...base, status, durationMs, error: errorMessage };
    }
  }
}
