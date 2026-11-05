/**
 * PRESERVE Authoring System — Schema layer.
 *
 * SchemaVersion.ts implements semantic versioning helpers using plain
 * functions and no external libraries. Versions are immutable, serializable
 * data; every operation returns a new value rather than mutating its input.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SemanticVersion } from './SchemaTypes';

export type { SemanticVersion };

/** Result of comparing two versions: -1 (less), 0 (equal), 1 (greater). */
export type VersionComparison = -1 | 0 | 1;

/** Which component of a semantic version to change. */
export type VersionComponent = 'major' | 'minor' | 'patch';

/** The version assigned to freshly created schemas. */
export const INITIAL_VERSION: SemanticVersion = { major: 1, minor: 0, patch: 0 };

/** Create a semantic version from its numeric components. */
export function createVersion(major = 1, minor = 0, patch = 0): SemanticVersion {
  return { major: normalize(major), minor: normalize(minor), patch: normalize(patch) };
}

/** Coerce a component into a non-negative integer. */
function normalize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** Render a version as the canonical `major.minor.patch` string. */
export function formatVersion(version: SemanticVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Whether a string matches the strict `major.minor.patch` numeric format. */
export function isValidVersionString(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value);
}

/** Whether an unknown value is a structurally valid {@link SemanticVersion}. */
export function isValidVersion(value: unknown): value is SemanticVersion {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SemanticVersion>;
  return (
    isNonNegativeInteger(candidate.major) &&
    isNonNegativeInteger(candidate.minor) &&
    isNonNegativeInteger(candidate.patch)
  );
}

/** Internal guard for non-negative integer components. */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Parse a `major.minor.patch` string.
 * @returns the parsed version, or `undefined` when the format is invalid.
 */
export function parseVersion(value: string): SemanticVersion | undefined {
  if (!isValidVersionString(value)) return undefined;
  const [major, minor, patch] = value.split('.').map((part) => Number.parseInt(part, 10));
  return { major, minor, patch };
}

/**
 * Compare two versions.
 * @returns -1 when `left` is older, 0 when equal, 1 when `left` is newer.
 */
export function compare(left: SemanticVersion, right: SemanticVersion): VersionComparison {
  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  return 0;
}

/** Whether two versions are exactly equal. */
export function equals(left: SemanticVersion, right: SemanticVersion): boolean {
  return compare(left, right) === 0;
}

/**
 * Whether `candidate` satisfies `required` under semantic-versioning rules:
 * the major components must match and the candidate must not be older.
 */
export function compatible(candidate: SemanticVersion, required: SemanticVersion): boolean {
  if (candidate.major !== required.major) return false;
  return compare(candidate, required) >= 0;
}

/**
 * Produce a newer version by incrementing one component.
 * Incrementing `major` resets minor and patch; incrementing `minor` resets patch.
 */
export function upgrade(version: SemanticVersion, component: VersionComponent = 'patch'): SemanticVersion {
  if (component === 'major') return { major: version.major + 1, minor: 0, patch: 0 };
  if (component === 'minor') return { major: version.major, minor: version.minor + 1, patch: 0 };
  return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

/**
 * Produce an older version by decrementing one component.
 * Components never fall below zero; lower components reset to zero.
 */
export function downgrade(version: SemanticVersion, component: VersionComponent = 'patch'): SemanticVersion {
  if (component === 'major') {
    return { major: Math.max(0, version.major - 1), minor: 0, patch: 0 };
  }
  if (component === 'minor') {
    return { major: version.major, minor: Math.max(0, version.minor - 1), patch: 0 };
  }
  return { major: version.major, minor: version.minor, patch: Math.max(0, version.patch - 1) };
}

/** Return whichever version is newer. Ties resolve to `left`. */
export function max(left: SemanticVersion, right: SemanticVersion): SemanticVersion {
  return compare(left, right) >= 0 ? left : right;
}

/** Return whichever version is older. Ties resolve to `left`. */
export function min(left: SemanticVersion, right: SemanticVersion): SemanticVersion {
  return compare(left, right) <= 0 ? left : right;
}
