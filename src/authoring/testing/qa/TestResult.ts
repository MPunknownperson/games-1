/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestResult.ts represents the immutable outcome of one completed test case.
 * Results are plain, JSON-serializable data with no functions.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { TestEvidence, TestSeverity, TestStatus } from './TestingTypes';

/** Immutable outcome of one test case evaluation. */
export interface TestResult {
  /** Identifier of the test case this result belongs to. */
  readonly testId: string;
  /** Lifecycle status at completion. */
  readonly status: TestStatus;
  /** Finding severity of the worst issue found, or INFO when clean. */
  readonly severity: TestSeverity;
  /** Human-readable messages explaining findings. */
  readonly messages: readonly string[];
  /** Error descriptions when the test failed. */
  readonly errors: readonly string[];
  /** Advisory warning descriptions. */
  readonly warnings: readonly string[];
  /** Evidence collected or supplied for this test. */
  readonly evidence: readonly TestEvidence[];
  /** ISO-8601 timestamp when the result was recorded. */
  readonly completedAt: string;
  /** Wall-clock milliseconds for evaluation, when timed. */
  readonly durationMs?: number;
}

/** Input accepted when constructing a test result. */
export interface TestResultInput {
  testId: string;
  status: TestStatus;
  severity?: TestSeverity;
  messages?: readonly string[];
  errors?: readonly string[];
  warnings?: readonly string[];
  evidence?: readonly TestEvidence[];
  timestamp?: string;
  durationMs?: number;
}

/** Build an immutable TestResult from an input specification. */
export function createTestResult(input: TestResultInput): TestResult {
  const errors = input.errors ? [...input.errors] : [];
  const warnings = input.warnings ? [...input.warnings] : [];
  const severity = input.severity ?? deriveSeverity(input.status, errors, warnings);
  return {
    testId: input.testId,
    status: input.status,
    severity,
    messages: input.messages ? [...input.messages] : [],
    errors,
    warnings,
    evidence: input.evidence ? [...input.evidence] : [],
    completedAt: input.timestamp ?? new Date().toISOString(),
    durationMs: input.durationMs,
  };
}

/** Build a passed result. */
export function createPassedResult(
  testId: string,
  evidence: readonly TestEvidence[] = [],
  options: { messages?: readonly string[]; timestamp?: string; durationMs?: number } = {},
): TestResult {
  return createTestResult({ testId, status: 'PASSED', evidence, ...options });
}

/** Build a failed result. */
export function createFailedResult(
  testId: string,
  errors: readonly string[],
  options: { evidence?: readonly TestEvidence[]; warnings?: readonly string[]; timestamp?: string; durationMs?: number } = {},
): TestResult {
  return createTestResult({ testId, status: 'FAILED', errors, ...options });
}

/** Build a skipped result. */
export function createSkippedResult(
  testId: string,
  reason: string,
  options: { timestamp?: string } = {},
): TestResult {
  return createTestResult({ testId, status: 'SKIPPED', messages: [reason], ...options });
}

/** Derive severity from status and error/warning counts. */
function deriveSeverity(
  status: TestStatus,
  errors: readonly string[],
  warnings: readonly string[],
): TestSeverity {
  if (status === 'FAILED' || errors.length > 0) return 'ERROR';
  if (warnings.length > 0) return 'WARNING';
  return 'INFO';
}

/** Serialize a result to a deterministic JSON string. */
export function testResultToJson(result: TestResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
