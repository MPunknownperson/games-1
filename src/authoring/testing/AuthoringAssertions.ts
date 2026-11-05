/**
 * PRESERVE Authoring System — testing infrastructure.
 *
 * AuthoringAssertions.ts provides lightweight assertion helpers. Every helper
 * throws an {@link AssertionFailure} with a readable message when the condition
 * does not hold. These are synchronous, dependency-free, and safe to use inside
 * any {@link AuthoringTest} body.
 *
 * Development-only; never imported by the runtime game.
 */

/** Error thrown when an assertion fails. Carries actual/expected for context. */
export class AssertionFailure extends Error {
  readonly actual?: unknown;
  readonly expected?: unknown;
  constructor(message: string, actual?: unknown, expected?: unknown) {
    super(message);
    this.name = 'AssertionFailure';
    this.actual = actual;
    this.expected = expected;
  }
}

/** Render a value into a short, human-readable string for messages. */
export function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (type === 'function') return `[function ${(value as { name?: string }).name || 'anonymous'}]`;
  if (type === 'symbol') return String(value);
  if (Array.isArray(value)) return `[array of ${value.length}]`;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    return json.length > 80 ? `${json.slice(0, 77)}...` : json;
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** Build a message, prefixing an optional custom label. */
function message(defaultMsg: string, custom?: string): string {
  return custom ? `${custom} — ${defaultMsg}` : defaultMsg;
}

/** Unconditionally fail with a readable message. */
export function fail(msg: string): never {
  throw new AssertionFailure(msg);
}

/** Assert that `condition` is truthy. */
export function assert(condition: unknown, custom?: string): asserts condition {
  if (!condition) {
    throw new AssertionFailure(message(`Expected truthy value but got ${describe(condition)}`, custom), condition, true);
  }
}

/** Assert strict equality using `Object.is` (correctly handles NaN). */
export function assertEqual<T>(actual: T, expected: T, custom?: string): void {
  if (!Object.is(actual, expected)) {
    throw new AssertionFailure(
      message(`Expected ${describe(actual)} to equal ${describe(expected)}`, custom),
      actual,
      expected,
    );
  }
}

/** Assert that two values are NOT strictly equal. */
export function assertNotEqual<T>(actual: T, notExpected: T, custom?: string): void {
  if (Object.is(actual, notExpected)) {
    throw new AssertionFailure(
      message(`Expected value to differ from ${describe(notExpected)}`, custom),
      actual,
      notExpected,
    );
  }
}

/** Assert a value is defined (neither `undefined` nor `null`). */
export function assertDefined<T>(value: T | undefined | null, custom?: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new AssertionFailure(message(`Expected a defined value but got ${describe(value)}`, custom), value);
  }
}

/** Assert a value is undefined or null. */
export function assertUndefined(value: unknown, custom?: string): void {
  if (value !== undefined && value !== null) {
    throw new AssertionFailure(message(`Expected undefined/null but got ${describe(value)}`, custom), value, undefined);
  }
}

/** Assert a value is strictly `true`. */
export function assertTrue(value: unknown, custom?: string): void {
  if (value !== true) {
    throw new AssertionFailure(message(`Expected true but got ${describe(value)}`, custom), value, true);
  }
}

/** Assert a value is strictly `false`. */
export function assertFalse(value: unknown, custom?: string): void {
  if (value !== false) {
    throw new AssertionFailure(message(`Expected false but got ${describe(value)}`, custom), value, false);
  }
}

/** Assert that a value is an array with the expected length. */
export function assertArrayLength(value: unknown, length: number, custom?: string): void {
  if (!Array.isArray(value)) {
    throw new AssertionFailure(message(`Expected an array but got ${describe(value)}`, custom), value);
  }
  if (value.length !== length) {
    throw new AssertionFailure(
      message(`Expected array length ${length} but got ${value.length}`, custom),
      value.length,
      length,
    );
  }
}

/**
 * Assert that `fn` throws. Returns the thrown error so callers can inspect it.
 * If `fn` does not throw, an {@link AssertionFailure} is raised.
 */
export function assertThrows(fn: () => unknown, custom?: string): Error {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error : new Error(describe(error));
  }
  throw new AssertionFailure(message('Expected the function to throw, but it did not', custom));
}
