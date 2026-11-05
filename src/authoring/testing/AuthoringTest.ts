/**
 * PRESERVE Authoring System — testing infrastructure.
 *
 * AuthoringTest.ts defines the contract for a single isolated validation.
 * A test carries a name, an optional description, an optional human-readable
 * "expected result" note, and an `execute` function. Expectations are enforced
 * inside `execute` using the assertion helpers (see AuthoringAssertions.ts).
 *
 * This file contains no global state and depends only on itself. It is
 * development-only and never imported by the runtime game.
 */

/** Lifecycle status of a single test execution. */
export type TestStatus = 'passed' | 'failed' | 'skipped';

/**
 * Runtime services handed to a test while it executes.
 * `warn` records a non-fatal warning on the report; `skip` aborts the test and
 * marks it as skipped with a reason.
 */
export interface AuthoringTestContext {
  /** Record a non-fatal warning attributed to this test. */
  warn(message: string): void;
  /** Abort the test and mark it skipped. Throws a {@link TestSkipSignal}. */
  skip(reason: string): never;
}

/** A function that performs the test body. May be synchronous or async. */
export type TestExecuteFn = (ctx: AuthoringTestContext) => void | Promise<void>;

/** A single isolated validation. */
export interface AuthoringTest {
  /** Unique, human-readable test name. */
  name: string;
  /** Optional longer description of what is validated. */
  description?: string;
  /** Optional human-readable statement of the expected outcome. */
  expected?: string;
  /** When explicitly `false`, the runner records the test as skipped. */
  enabled?: boolean;
  /** The test body. Throws an AssertionFailure (or Error) on failure. */
  execute: TestExecuteFn;
}

/** Input accepted by {@link defineTest}. */
export interface AuthoringTestSpec {
  name: string;
  description?: string;
  expected?: string;
  enabled?: boolean;
  execute: TestExecuteFn;
}

/**
 * Internal signal thrown by `ctx.skip(...)`. The runner catches this to mark a
 * test as skipped rather than failed. Exported so the runner can detect it.
 */
export class TestSkipSignal extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Test skipped: ${reason}`);
    this.name = 'TestSkipSignal';
    this.reason = reason;
  }
}

/**
 * Create a test from a spec. This is the canonical way future authoring
 * modules declare validations.
 */
export function defineTest(spec: AuthoringTestSpec): AuthoringTest {
  return {
    name: spec.name,
    description: spec.description,
    expected: spec.expected,
    enabled: spec.enabled,
    execute: spec.execute,
  };
}

/** Handlers used to build a live {@link AuthoringTestContext}. */
export interface TestContextHandlers {
  onWarn: (message: string) => void;
}

/**
 * Build the context object passed into a test's `execute`. Warnings are
 * forwarded to the supplied handler; `skip` throws a {@link TestSkipSignal}.
 */
export function createTestContext(handlers: TestContextHandlers): AuthoringTestContext {
  return {
    warn: (message: string) => handlers.onWarn(message),
    skip: (reason: string) => {
      throw new TestSkipSignal(reason);
    },
  };
}
