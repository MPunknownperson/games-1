/** Central safety rules for AI-assisted repair planning and execution. */
import { pathMatchesAny, type SafeRepairContext } from './SafeRepairContext';
import {
  RepairDecision,
  RepairOperation,
  RepairRisk,
  RepairScope,
  type RepairChange,
  type RepairFinding,
  type RepairScope as RepairScopeType,
  type SafeRepairPlan,
} from './SafeRepairTypes';

/** Maximum number of files affected by an automatic SMALL repair. */
export const MAX_AUTO_FILES = 3;

/** Maximum estimated or actual changed lines for an automatic SMALL repair. */
export const MAX_AUTO_LINES = 50;

/** Operations allowed by the in-memory automatic executor. */
export const ALLOWED_AUTO_OPERATIONS = [
  RepairOperation.REPLACE_TEXT,
  RepairOperation.INSERT_TEXT,
  RepairOperation.ADD_GUARD,
  RepairOperation.CORRECT_LOCAL_CODE,
] as const;

/** Operations that always require approval if introduced in a future extension. */
export const REQUIRES_APPROVAL_OPERATIONS = [
  'ADD_FILE',
  'REMOVE_FILE',
  'CONFIG_CHANGE',
  'DEPENDENCY_CHANGE',
] as const;

/** Numeric rank used for maximum-scope comparisons. */
export function scopeWeight(scope: RepairScopeType): number {
  return [RepairScope.TRIVIAL, RepairScope.SMALL, RepairScope.MODERATE, RepairScope.LARGE].indexOf(scope);
}

/** Result of evaluating a finding or plan against policy. */
export interface SafeRepairPolicyResult {
  readonly decision: RepairDecision;
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly requiresHumanApproval: boolean;
}

/** Evaluate whether a finding may proceed to automatic repair. */
export function evaluateFinding(
  finding: RepairFinding,
  context: SafeRepairContext,
): SafeRepairPolicyResult {
  const reasons: string[] = [];
  const protectedTarget = finding.affectedPaths.some((path) =>
    pathMatchesAny(path, context.protectedPaths),
  );
  const outsideAllowed = finding.affectedPaths.some((path) =>
    !pathMatchesAny(path, context.allowedPaths),
  );

  if (protectedTarget || finding.runtimeImpact || finding.architectureImpact) {
    reasons.push('Repair targets protected runtime paths or has architecture/runtime impact.');
    return result(RepairDecision.REJECTED, reasons);
  }
  if (outsideAllowed) {
    reasons.push('At least one target is outside approved project scope.');
    return result(RepairDecision.REJECTED, reasons);
  }
  if (finding.scope === RepairScope.LARGE) {
    reasons.push('Large repairs are rejected by the automatic repair workflow.');
    return result(RepairDecision.REJECTED, reasons);
  }
  if (finding.scope === RepairScope.MODERATE) reasons.push('Moderate repairs require approval.');
  if (finding.apiImpact) reasons.push('Public API impact requires approval.');
  if (finding.dependencyImpact) reasons.push('Dependency impact requires approval.');
  if (finding.affectedFiles > MAX_AUTO_FILES) reasons.push(`Affected files exceed ${MAX_AUTO_FILES}.`);
  if (finding.estimatedChanges > MAX_AUTO_LINES) reasons.push(`Estimated lines exceed ${MAX_AUTO_LINES}.`);
  if (scopeWeight(finding.scope) > scopeWeight(context.maximumRepairScope)) {
    reasons.push(`Scope ${finding.scope} exceeds context maximum ${context.maximumRepairScope}.`);
  }

  if (reasons.length > 0) return result(RepairDecision.REQUIRES_APPROVAL, reasons);
  return result(RepairDecision.AUTO_FIX_ALLOWED, []);
}

/** Validate a plan immediately before in-memory execution. */
export function evaluatePlanForExecution(
  plan: SafeRepairPlan,
  context: SafeRepairContext,
): SafeRepairPolicyResult {
  const base = evaluateFinding(plan.finding, context);
  const reasons = [...base.reasons];
  if (plan.decision !== RepairDecision.AUTO_FIX_ALLOWED) {
    reasons.push('Plan was not classified for automatic repair.');
  }
  if (plan.changes.length === 0) reasons.push('Plan contains no local changes.');
  for (const change of plan.changes) checkChange(change, context, reasons);
  const uniquePaths = new Set(plan.changes.map((change) => change.path));
  const estimatedLines = plan.changes.reduce((total, change) => total + change.estimatedLines, 0);
  if (uniquePaths.size > MAX_AUTO_FILES) reasons.push(`Plan exceeds ${MAX_AUTO_FILES} changed files.`);
  if (estimatedLines > MAX_AUTO_LINES) reasons.push(`Plan exceeds ${MAX_AUTO_LINES} changed lines.`);
  return reasons.length > 0
    ? result(base.decision === RepairDecision.REJECTED ? RepairDecision.REJECTED : RepairDecision.REQUIRES_APPROVAL, reasons)
    : result(RepairDecision.AUTO_FIX_ALLOWED, []);
}

/** Apply path and operation restrictions to one planned change. */
function checkChange(
  change: RepairChange,
  context: SafeRepairContext,
  reasons: string[],
): void {
  if (!ALLOWED_AUTO_OPERATIONS.includes(change.operation as typeof ALLOWED_AUTO_OPERATIONS[number])) {
    reasons.push(`Operation ${change.operation} is not allowed for automatic repair.`);
  }
  if (pathMatchesAny(change.path, context.protectedPaths)) {
    reasons.push(`Protected path cannot be modified: ${change.path}.`);
  } else if (!pathMatchesAny(change.path, context.allowedPaths)) {
    reasons.push(`Path is outside approved scope: ${change.path}.`);
  }
  if (change.estimatedLines > MAX_AUTO_LINES) {
    reasons.push(`Change ${change.id} exceeds the automatic line limit.`);
  }
}

/** Create a normalized policy result. */
function result(decision: RepairDecision, reasons: readonly string[]): SafeRepairPolicyResult {
  return {
    decision,
    allowed: decision === RepairDecision.AUTO_FIX_ALLOWED,
    reasons: [...reasons],
    requiresHumanApproval: decision === RepairDecision.REQUIRES_APPROVAL,
  };
}

/** Infer a conservative risk from scope and structural impact. */
export function inferPolicyRisk(finding: RepairFinding): RepairRisk {
  if (finding.runtimeImpact || finding.architectureImpact || finding.scope === RepairScope.LARGE) return RepairRisk.CRITICAL;
  if (finding.apiImpact || finding.dependencyImpact || finding.scope === RepairScope.MODERATE) return RepairRisk.HIGH;
  if (finding.scope === RepairScope.SMALL) return RepairRisk.MEDIUM;
  return RepairRisk.LOW;
}