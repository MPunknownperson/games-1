/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestCase.ts represents one test definition. It is pure descriptive data
 * used for planning and reporting — it contains no execution logic and no
 * references to the runtime game.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type {
  TestCategory,
  TestMetadata,
  TestRequirement,
  TestSeverity,
} from './TestingTypes';

/**
 * A single test definition describing what should be verified,
 * what evidence is required, and what outcome is expected.
 */
export interface TestCase {
  /** Stable unique identifier (e.g., 'build.bundle-unchanged'). */
  readonly id: string;
  /** Short, human-readable test name. */
  readonly name: string;
  /** Explanation of what the test verifies. */
  readonly description: string;
  /** Quality dimension this test belongs to. */
  readonly category: TestCategory;
  /** Logical target being tested (e.g., a file path or module name). */
  readonly target: string;
  /** Description of the expected successful outcome. */
  readonly expectedResult: string;
  /** Evidence that must be present for the test to be evaluatable. */
  readonly requiredEvidence: readonly TestRequirement[];
  /** How serious a failure of this test is. */
  readonly severity: TestSeverity;
  /** Optional descriptive metadata. */
  readonly metadata?: TestMetadata;
  /** Identifiers of other test cases that must pass before this one. */
  readonly dependencies?: readonly string[];
  /** When explicitly false, the test is excluded from execution. */
  readonly enabled?: boolean;
}

/** Input accepted when constructing a test case. */
export interface TestCaseInput {
  id: string;
  name: string;
  description: string;
  category: TestCategory;
  target: string;
  expectedResult: string;
  requiredEvidence?: readonly TestRequirement[];
  severity?: TestSeverity;
  metadata?: TestMetadata;
  dependencies?: readonly string[];
  enabled?: boolean;
}

/** Build a TestCase from an input specification with sensible defaults. */
export function createTestCase(input: TestCaseInput): TestCase {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    category: input.category,
    target: input.target,
    expectedResult: input.expectedResult,
    requiredEvidence: input.requiredEvidence ? [...input.requiredEvidence] : [],
    severity: input.severity ?? 'ERROR',
    metadata: input.metadata ? { ...input.metadata } : undefined,
    dependencies: input.dependencies ? [...input.dependencies] : undefined,
    enabled: input.enabled,
  };
}

/** Compare two test cases by category then id for deterministic ordering. */
export function compareTestCases(left: TestCase, right: TestCase): number {
  const catDiff = left.category.localeCompare(right.category);
  return catDiff !== 0 ? catDiff : left.id.localeCompare(right.id);
}

/** Validate that a test case has the minimum required structural fields. */
export function validateTestCaseShape(testCase: TestCase): readonly string[] {
  const errors: string[] = [];
  if (typeof testCase?.id !== 'string' || testCase.id.trim().length === 0) errors.push('id is missing.');
  if (typeof testCase?.name !== 'string' || testCase.name.trim().length === 0) errors.push('name is missing.');
  if (typeof testCase?.category !== 'string') errors.push('category is missing.');
  if (typeof testCase?.target !== 'string' || testCase.target.trim().length === 0) errors.push('target is missing.');
  if (typeof testCase?.expectedResult !== 'string') errors.push('expectedResult is missing.');
  return errors;
}
