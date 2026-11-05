/** Post-repair verification gates driven by caller-supplied evidence. */
import type { SafeRepairContext } from './SafeRepairContext';
import { pathMatchesAny } from './SafeRepairContext';
import { MAX_AUTO_LINES } from './SafeRepairPolicy';
import type { RepairExecutionOutput, SafeRepairPlan } from './SafeRepairTypes';

/** Evidence produced by existing build, type-check, test, and import checks. */
export interface RepairVerificationEvidence {
  readonly buildSucceeded?: boolean;
  readonly typeCheckPassed?: boolean;
  readonly testsPassed?: boolean;
  readonly errorsBefore?: number;
  readonly errorsAfter?: number;
  readonly forbiddenImportsAdded?: readonly string[];
  readonly actualChangedPaths: readonly string[];
  readonly actualChangedLines: number;
}

/** Serializable result of post-repair verification. */
export interface RepairVerificationResult {
  readonly passed: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Verify execution output against required evidence and the approved plan.
 * This function does not run builds, type checks, or tests; existing systems
 * provide their outcomes as evidence, preserving the no-subprocess boundary.
 */
export function verifyRepair(
  plan: SafeRepairPlan,
  execution: RepairExecutionOutput,
  evidence: RepairVerificationEvidence,
  context: SafeRepairContext,
): RepairVerificationResult {
  const checks: Record<string, boolean> = { executionSucceeded: execution.success };
  const errors: string[] = [];
  const warnings: string[] = [];
  requireCheck('buildSucceeded', context.verification.buildRequired, evidence.buildSucceeded, checks, errors);
  requireCheck('typeCheckPassed', context.verification.typeCheckRequired, evidence.typeCheckPassed, checks, errors);
  requireCheck('testsPassed', context.verification.testsRequired, evidence.testsPassed, checks, errors);

  const noNewErrors = (evidence.errorsAfter ?? 0) <= (evidence.errorsBefore ?? 0);
  checks.noNewErrors = noNewErrors;
  if (!noNewErrors) errors.push('Repair introduced new errors.');

  const noForbiddenImports = (evidence.forbiddenImportsAdded?.length ?? 0) === 0;
  checks.noForbiddenImports = noForbiddenImports;
  if (context.verification.forbiddenImportCheckRequired && !noForbiddenImports) {
    errors.push(`Repair added forbidden imports: ${evidence.forbiddenImportsAdded?.join(', ')}.`);
  }

  const planned = new Set(plan.changes.map((change) => change.path));
  const pathsMatch = evidence.actualChangedPaths.every((path) => planned.has(path)) &&
    evidence.actualChangedPaths.every((path) => pathMatchesAny(path, context.allowedPaths));
  checks.changedPathsMatchPlan = pathsMatch;
  if (context.verification.changedPathCheckRequired && !pathsMatch) {
    errors.push('Changed files do not match the approved plan or allowed paths.');
  }
  checks.changedLinesWithinPlan = evidence.actualChangedLines <= plan.finding.estimatedChanges;
  if (!checks.changedLinesWithinPlan) warnings.push('Actual changed lines exceeded the estimate.');
  checks.changedLinesWithinLimit = evidence.actualChangedLines <= MAX_AUTO_LINES;
  if (!checks.changedLinesWithinLimit) errors.push(`Actual changes exceeded ${MAX_AUTO_LINES} lines.`);
  if (!execution.success) errors.push(...execution.errors);
  return { passed: errors.length === 0, checks, errors, warnings };
}

/** Enforce one optional evidence gate. */
function requireCheck(
  name: string,
  required: boolean,
  value: boolean | undefined,
  checks: Record<string, boolean>,
  errors: string[],
): void {
  if (!required) return;
  checks[name] = value === true;
  if (value !== true) errors.push(`${name} verification did not pass.`);
}