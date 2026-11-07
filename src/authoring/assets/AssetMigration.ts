/**
 * Version comparison, compatibility checks, and migration planning for future
 * schema and format changes.
 *
 * This module never rewrites assets. A migration plan describes which declared
 * steps would be needed. Applying a step is a separate, future decision.
 */
import { SEMVER_PATTERN, compareStrings } from "./AssetTypes";

/** Format version written by AssetSerializer. */
export const CURRENT_FORMAT_VERSION = "1.0.0";

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemanticVersion(text: string): SemanticVersion | null {
  if (!SEMVER_PATTERN.test(text)) return null;
  const [major, minor, patch] = text.split(".").map(Number);
  return { major, minor, patch };
}

/** Returns -1, 0, or 1 for a < b, a = b, a > b. Returns null if either version is invalid. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseSemanticVersion(a);
  const right = parseSemanticVersion(b);
  if (left === null || right === null) return null;
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}

export type CompatibilityStatus = "CURRENT" | "MIGRATION_REQUIRED" | "INCOMPATIBLE";

export interface CompatibilityResult {
  status: CompatibilityStatus;
  compatible: boolean;
  reason: string;
}

/**
 * Compares a data version with the version this reader supports.
 * - Same version: CURRENT.
 * - Older, same major: MIGRATION_REQUIRED. The data can be read after a migration plan.
 * - Different major, or newer than supported: INCOMPATIBLE.
 */
export function checkCompatibility(assetVersion: string, supportedVersion: string): CompatibilityResult {
  const order = compareVersions(assetVersion, supportedVersion);
  if (order === null) {
    return { status: "INCOMPATIBLE", compatible: false, reason: "Version is not MAJOR.MINOR.PATCH." };
  }
  const data = parseSemanticVersion(assetVersion);
  const supported = parseSemanticVersion(supportedVersion);
  if (data === null || supported === null) {
    return { status: "INCOMPATIBLE", compatible: false, reason: "Version is not MAJOR.MINOR.PATCH." };
  }
  if (data.major !== supported.major) {
    return { status: "INCOMPATIBLE", compatible: false, reason: `Major version ${data.major} differs from supported ${supported.major}.` };
  }
  if (order > 0) {
    return { status: "INCOMPATIBLE", compatible: false, reason: `Version ${assetVersion} is newer than supported ${supportedVersion}.` };
  }
  if (order < 0) {
    return { status: "MIGRATION_REQUIRED", compatible: true, reason: `Version ${assetVersion} is older than ${supportedVersion}; a migration plan is required.` };
  }
  return { status: "CURRENT", compatible: true, reason: "Version matches." };
}

/** A declared, human-described schema change. It carries no transform code. */
export interface MigrationStep {
  fromVersion: string;
  toVersion: string;
  description: string;
  breaking: boolean;
}

export type MigrationPlanStatus = "NOT_NEEDED" | "PLANNED" | "NO_PATH";

export interface MigrationPlan {
  fromVersion: string;
  toVersion: string;
  status: MigrationPlanStatus;
  steps: MigrationStep[];
  reason: string;
}

function noPath(fromVersion: string, toVersion: string, reason: string): MigrationPlan {
  return { fromVersion, toVersion, status: "NO_PATH", steps: [], reason };
}

function sortSteps(steps: MigrationStep[]): MigrationStep[] {
  return [...steps].sort(
    (a, b) =>
      compareStrings(a.fromVersion, b.fromVersion) || compareStrings(a.toVersion, b.toVersion),
  );
}

/** Finds the step that leaves `current` and does not pass `target`. */
function nextStep(steps: MigrationStep[], current: string, target: string): MigrationStep | undefined {
  return steps.find(
    (step) => step.fromVersion === current && (compareVersions(step.toVersion, target) ?? 1) <= 0,
  );
}

/**
 * Plans a walk from one version to another over declared steps. It only describes
 * the path and never modifies data. Downgrades, unknown versions, and missing
 * links return NO_PATH. The walk is bounded by the number of declared steps.
 */
export function planMigration(
  fromVersion: string,
  toVersion: string,
  declaredSteps: MigrationStep[],
): MigrationPlan {
  const order = compareVersions(fromVersion, toVersion);
  if (order === null) return noPath(fromVersion, toVersion, "Version is not MAJOR.MINOR.PATCH.");
  if (order === 0) return { fromVersion, toVersion, status: "NOT_NEEDED", steps: [], reason: "Versions match." };
  if (order > 0) return noPath(fromVersion, toVersion, "Downgrades are not supported.");

  const sorted = sortSteps(declaredSteps);
  const steps: MigrationStep[] = [];
  let current = fromVersion;
  while (compareVersions(current, toVersion) !== 0) {
    const step = nextStep(sorted, current, toVersion);
    if (step === undefined || steps.length >= sorted.length) {
      return noPath(fromVersion, toVersion, `No declared migration path from ${current}.`);
    }
    steps.push(step);
    current = step.toVersion;
  }
  return { fromVersion, toVersion, status: "PLANNED", steps, reason: `${steps.length} declared step(s).` };
}

/** Human-readable lines for a plan. Descriptions only. */
export function describeMigrationPlan(plan: MigrationPlan): string[] {
  const header = `Migration ${plan.fromVersion} -> ${plan.toVersion}: ${plan.status} (${plan.reason})`;
  const lines = plan.steps.map((step, i) => {
    const flag = step.breaking ? " [breaking]" : "";
    return `  ${i + 1}. ${step.fromVersion} -> ${step.toVersion}${flag}: ${step.description}`;
  });
  return [header, ...lines];
}
