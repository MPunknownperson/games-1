/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestPolicy.ts defines safety rules governing test plan validation,
 * evidence requirements, and execution boundaries.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { TestCase } from './TestCase';
import type { TestPlan } from './TestPlan';
import type { TestCategory, TestEvidence } from './TestingTypes';

/** Configurable safety policy for QA evidence collection and planning. */
export interface TestPolicyConfig {
  /** Maximum number of test cases permitted in a single plan. */
  readonly maxTestCount: number;
  /** Paths that test targets must never reference. */
  readonly protectedPaths: readonly string[];
  /** Evidence categories that must be present before a plan is valid. */
  readonly requiredEvidenceCategories: readonly TestCategory[];
  /** Whether all mandatory evidence must pass for the plan to be valid. */
  readonly requireAllMandatoryEvidence: boolean;
}

/** Default policy matching PRESERVE authoring safety standards. */
export const DEFAULT_TEST_POLICY: Readonly<TestPolicyConfig> = {
  maxTestCount: 500,
  protectedPaths: [
    'src/engine/',
    'src/runtime/',
    'src/game/',
    'src/ui/',
  ],
  requiredEvidenceCategories: ['BUILD', 'TYPECHECK'],
  requireAllMandatoryEvidence: true,
};

/** Outcome of evaluating a plan or test against the policy. */
export interface TestPolicyResult {
  readonly allowed: boolean;
  readonly violations: readonly string[];
}

/** Evaluate a test plan against the safety policy. */
export function evaluateTestPlan(
  plan: TestPlan,
  policy: TestPolicyConfig = DEFAULT_TEST_POLICY,
): TestPolicyResult {
  const violations: string[] = [];
  if (plan.testCount() > policy.maxTestCount) {
    violations.push(`Plan has ${plan.testCount()} tests, exceeding the maximum of ${policy.maxTestCount}.`);
  }
  for (const tc of plan.listTests()) {
    for (const prefix of policy.protectedPaths) {
      if (tc.target.replace(/\\/g, '/').startsWith(prefix)) {
        violations.push(`Test "${tc.id}" targets protected path "${tc.target}".`);
      }
    }
  }
  return { allowed: violations.length === 0, violations };
}

/** Check whether an individual test case targets a protected path. */
export function evaluateTestCase(
  testCase: TestCase,
  policy: TestPolicyConfig = DEFAULT_TEST_POLICY,
): TestPolicyResult {
  const violations: string[] = [];
  for (const prefix of policy.protectedPaths) {
    if (testCase.target.replace(/\\/g, '/').startsWith(prefix)) {
      violations.push(`Test "${testCase.id}" targets protected path "${testCase.target}".`);
    }
  }
  return { allowed: violations.length === 0, violations };
}

/** Verify that all required evidence categories are present and passed. */
export function evaluateRequiredEvidence(
  evidence: readonly TestEvidence[],
  policy: TestPolicyConfig = DEFAULT_TEST_POLICY,
): TestPolicyResult {
  const violations: string[] = [];
  for (const required of policy.requiredEvidenceCategories) {
    const matching = evidence.filter((e) => e.category === required);
    if (matching.length === 0) {
      violations.push(`Required evidence category "${required}" is missing.`);
    } else if (policy.requireAllMandatoryEvidence && !matching.every((e) => e.passed)) {
      violations.push(`Required evidence category "${required}" did not pass.`);
    }
  }
  return { allowed: violations.length === 0, violations };
}
