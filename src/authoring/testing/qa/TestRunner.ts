/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestRunner.ts orchestrates test evaluation using dependency injection.
 * It accepts a TestPlan and externally provided executor functions, but
 * contains no testing logic itself and maintains no global mutable state.
 *
 * Supported execution modes:
 * - PLAN_ONLY  — validate the plan structure without executing tests.
 * - DRY_RUN    — simulate execution, producing passed placeholder results.
 * - EVIDENCE_ONLY — evaluate tests using only supplied evidence (no executor).
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { TestCase } from './TestCase';
import type { TestPlan } from './TestPlan';
import {
  createFailedResult,
  createPassedResult,
  createSkippedResult,
  type TestResult,
} from './TestResult';
import type { TestEvidence } from './TestingTypes';

/** Modes governing how the runner evaluates test cases. */
export const TestRunMode = {
  PLAN_ONLY: 'PLAN_ONLY',
  DRY_RUN: 'DRY_RUN',
  EVIDENCE_ONLY: 'EVIDENCE_ONLY',
} as const;

export type TestRunMode = (typeof TestRunMode)[keyof typeof TestRunMode];

/**
 * Injected executor function. Receives the test case and available evidence,
 * returns a test result. The runner itself never decides pass or fail.
 */
export type TestCaseExecutor = (
  testCase: TestCase,
  evidence: readonly TestEvidence[],
) => TestResult | Promise<TestResult>;

/** Options accepted when running a plan. */
export interface TestRunOptions {
  mode?: TestRunMode;
  executor?: TestCaseExecutor;
  evidence?: readonly TestEvidence[];
  timestamp?: string;
}

/** Outcome of a test run (the runner's output before aggregation into a report). */
export interface TestRunOutcome {
  readonly planId: string;
  readonly mode: TestRunMode;
  readonly results: readonly TestResult[];
  readonly completedAt: string;
}

/** Default evidence-only executor: passes when all mandatory evidence exists and passes. */
function defaultEvidenceExecutor(tc: TestCase, evidence: readonly TestEvidence[]): TestResult {
  for (const req of tc.requiredEvidence) {
    if (!req.mandatory) continue;
    const match = evidence.find((e) => e.category === req.category);
    if (!match) return createFailedResult(tc.id, [`Missing mandatory evidence: ${req.category}`]);
    if (!match.passed) return createFailedResult(tc.id, [`Evidence for ${req.category} did not pass.`], { evidence: [match] });
  }
  const relevant = evidence.filter((e) => tc.requiredEvidence.some((r) => r.category === e.category));
  return createPassedResult(tc.id, relevant);
}

/**
 * Orchestrate test plan evaluation.
 * Composition-friendly: instantiate per QA session.
 */
export class TestRunner {
  /**
   * Execute a test plan according to the supplied mode and options.
   * Always resolves with a {@link TestRunOutcome}; individual failures
   * are recorded per test and never abort the run.
   */
  async run(plan: TestPlan, options: TestRunOptions = {}): Promise<TestRunOutcome> {
    const mode = options.mode ?? TestRunMode.EVIDENCE_ONLY;
    const evidence = options.evidence ?? [];
    const results: TestResult[] = [];
    const timestamp = options.timestamp ?? new Date().toISOString();

    if (mode === TestRunMode.PLAN_ONLY) {
      return { planId: plan.planId, mode, results: [], completedAt: timestamp };
    }

    const ordered = plan.listTests();
    for (const tc of ordered) {
      if (tc.enabled === false) {
        results.push(createSkippedResult(tc.id, 'Test is disabled.', { timestamp }));
        continue;
      }
      results.push(await this.evaluateTest(tc, mode, evidence, options.executor, timestamp));
    }
    return { planId: plan.planId, mode, results, completedAt: timestamp };
  }

  /** Evaluate a single test case using the appropriate strategy. */
  private async evaluateTest(
    tc: TestCase,
    mode: TestRunMode,
    evidence: readonly TestEvidence[],
    executor: TestCaseExecutor | undefined,
    timestamp: string,
  ): Promise<TestResult> {
    if (mode === TestRunMode.DRY_RUN) {
      return createPassedResult(tc.id, [], { messages: ['Dry-run placeholder'], timestamp });
    }
    try {
      const exec = executor ?? defaultEvidenceExecutor;
      return await exec(tc, evidence);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return createFailedResult(tc.id, [`Executor threw: ${msg}`], { timestamp });
    }
  }
}
