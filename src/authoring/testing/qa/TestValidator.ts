/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestValidator.ts validates test plans and results for structural
 * completeness: missing IDs, duplicate tests, invalid categories, missing
 * evidence, and inconsistent results.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { validateTestCaseShape, type TestCase } from './TestCase';
import type { TestPlan } from './TestPlan';
import type { TestResult } from './TestResult';
import { TestCategory, TestStatus, type TestEvidence } from './TestingTypes';

/** One structural finding produced during validation. */
export interface TestValidationIssue {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly testId?: string;
}

/** Aggregate outcome of a validation pass. */
export interface TestValidationResult {
  readonly valid: boolean;
  readonly issues: readonly TestValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
}

const VALID_CATEGORIES = new Set<string>(Object.values(TestCategory));
const VALID_STATUSES = new Set<string>(Object.values(TestStatus));

/** Validate a test plan's structural completeness. */
export function validateTestPlan(plan: TestPlan): TestValidationResult {
  const issues: TestValidationIssue[] = [];
  if (!plan.planId || plan.planId.trim().length === 0) {
    issues.push({ code: 'QA_MISSING_PLAN_ID', severity: 'error', message: 'Plan has no planId.' });
  }
  const seen = new Set<string>();
  for (const tc of plan.listTests()) {
    if (seen.has(tc.id)) issues.push({ code: 'QA_DUPLICATE_TEST', severity: 'error', message: `Duplicate test id "${tc.id}".`, testId: tc.id });
    seen.add(tc.id);
    validateCase(tc, issues);
  }
  const depResult = plan.validate();
  for (const err of depResult.errors) issues.push({ code: 'QA_DEPENDENCY_ERROR', severity: 'error', message: err });
  return buildResult(issues);
}

/** Validate a single test case structure. */
function validateCase(tc: TestCase, issues: TestValidationIssue[]): void {
  for (const err of validateTestCaseShape(tc)) {
    issues.push({ code: 'QA_INVALID_CASE', severity: 'error', message: err, testId: tc.id });
  }
  if (!VALID_CATEGORIES.has(tc.category as string)) {
    issues.push({ code: 'QA_INVALID_CATEGORY', severity: 'error', message: `Test "${tc.id}" has invalid category "${tc.category}".`, testId: tc.id });
  }
}

/** Validate a set of test results against a plan. */
export function validateTestResults(
  results: readonly TestResult[],
  plan: TestPlan,
): TestValidationResult {
  const issues: TestValidationIssue[] = [];
  for (const result of results) {
    if (!plan.hasTest(result.testId)) {
      issues.push({ code: 'QA_UNKNOWN_TEST_RESULT', severity: 'warning', message: `Result references unknown test "${result.testId}".`, testId: result.testId });
    }
    if (!VALID_STATUSES.has(result.status as string)) {
      issues.push({ code: 'QA_INVALID_STATUS', severity: 'error', message: `Result for "${result.testId}" has invalid status "${result.status}".`, testId: result.testId });
    }
  }
  for (const tc of plan.listTests()) {
    if (tc.enabled === false) continue;
    const hasResult = results.some((r) => r.testId === tc.id);
    if (!hasResult) {
      issues.push({ code: 'QA_MISSING_RESULT', severity: 'warning', message: `Test "${tc.id}" has no result.`, testId: tc.id });
    }
    for (const req of tc.requiredEvidence) {
      if (!req.mandatory) continue;
      const matching = results
        .filter((r) => r.testId === tc.id)
        .flatMap((r) => r.evidence)
        .some((e) => e.category === req.category);
      if (!matching) {
        issues.push({ code: 'QA_MISSING_EVIDENCE', severity: 'error', message: `Test "${tc.id}" missing mandatory evidence for "${req.category}".`, testId: tc.id });
      }
    }
  }
  return buildResult(issues);
}

/** Validate evidence in isolation. */
export function validateEvidence(evidence: readonly TestEvidence[]): TestValidationResult {
  const issues: TestValidationIssue[] = [];
  for (const e of evidence) {
    if (!VALID_CATEGORIES.has(e.category as string)) {
      issues.push({ code: 'QA_INVALID_EVIDENCE_CATEGORY', severity: 'error', message: `Evidence has invalid category "${e.category}".` });
    }
    if (typeof e.recordedAt !== 'string' || e.recordedAt.length === 0) {
      issues.push({ code: 'QA_MISSING_EVIDENCE_TIMESTAMP', severity: 'warning', message: 'Evidence is missing a recordedAt timestamp.' });
    }
  }
  return buildResult(issues);
}

function buildResult(issues: TestValidationIssue[]): TestValidationResult {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return { valid: errorCount === 0, issues, errorCount, warningCount: issues.length - errorCount };
}
