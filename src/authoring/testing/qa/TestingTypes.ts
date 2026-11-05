/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestingTypes.ts defines the shared, JSON-serializable contracts used by the
 * QA evidence collection, test planning, and reporting infrastructure.
 *
 * This layer describes, collects, validates, and serializes test evidence.
 * It never executes shell commands, compilers, filesystem writes, network
 * requests, git operations, or deployment steps.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Broad quality dimension a test case belongs to. */
export const TestCategory = {
  BUILD: 'BUILD',
  TYPECHECK: 'TYPECHECK',
  LINT: 'LINT',
  UNIT: 'UNIT',
  INTEGRATION: 'INTEGRATION',
  STRUCTURE: 'STRUCTURE',
  SERIALIZATION: 'SERIALIZATION',
  ISOLATION: 'ISOLATION',
} as const;

export type TestCategory = (typeof TestCategory)[keyof typeof TestCategory];

/** Lifecycle status of an individual test case execution. */
export const TestStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type TestStatus = (typeof TestStatus)[keyof typeof TestStatus];

/** Severity classification for test findings or messages. */
export const TestSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export type TestSeverity = (typeof TestSeverity)[keyof typeof TestSeverity];

/** Externally supplied quality evidence about one dimension. */
export interface TestEvidence {
  /** Quality dimension this evidence covers. */
  readonly category: TestCategory;
  /** Whether the dimension passed according to the external tool. */
  readonly passed: boolean;
  /** Specific measured values (e.g., { typeErrors: 0, bundleSize: "320kb" }). */
  readonly measurements: Readonly<Record<string, string | number | boolean | null>>;
  /** Optional messages from the external tool. */
  readonly messages?: readonly string[];
  /** ISO-8601 timestamp when the evidence was recorded. */
  readonly recordedAt: string;
}

/** Descriptive metadata attached to test cases, plans, and results. */
export interface TestMetadata {
  readonly label?: string;
  readonly author?: string;
  readonly version?: string;
  readonly tags?: readonly string[];
  readonly properties?: Readonly<Record<string, string | number | boolean | null>>;
}

/** A declarative requirement describing what evidence must exist for a test
 * to be considered evaluatable. */
export interface TestRequirement {
  /** Quality dimension required. */
  readonly category: TestCategory;
  /** Human-readable explanation of what is needed. */
  readonly description: string;
  /** When true, the test cannot pass without this evidence. */
  readonly mandatory: boolean;
}

/** Breadth and depth of a planned test execution. */
export const TestScope = {
  /** Only structure and serialization checks. */
  MINIMAL: 'MINIMAL',
  /** Standard checks excluding integration. */
  STANDARD: 'STANDARD',
  /** All registered test categories. */
  COMPREHENSIVE: 'COMPREHENSIVE',
} as const;

export type TestScope = (typeof TestScope)[keyof typeof TestScope];

/** Build a TestEvidence from externally supplied raw data. */
export function createTestEvidence(
  category: TestCategory,
  passed: boolean,
  measurements: Record<string, string | number | boolean | null>,
  options: { messages?: readonly string[]; timestamp?: string } = {},
): TestEvidence {
  return {
    category,
    passed,
    measurements: { ...measurements },
    messages: options.messages ? [...options.messages] : undefined,
    recordedAt: options.timestamp ?? new Date().toISOString(),
  };
}
