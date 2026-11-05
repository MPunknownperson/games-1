/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairValidator.ts validates RepairPlan structural completeness and safety.
 * It checks for invalid paths, forbidden targets, excessive risk, missing
 * issue references, invalid action types, and incomplete repair descriptions.
 *
 * It validates *structure and safety policy* only — never gameplay rules,
 * balance, graphics, or runtime behaviour.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { RepairContext } from './RepairContext';
import type { RepairPlan } from './RepairPlan';
import { DEFAULT_REPAIR_POLICY, type RepairPolicy } from './RepairPolicy';
import { RepairActionType } from './RepairTypes';

/** Severity of a single repair validation finding. */
export type RepairIssueSeverity = 'error' | 'warning';

/** One structural or safety finding produced during repair validation. */
export interface RepairValidationIssue {
  /** Stable machine-readable code (e.g. `REPAIR_FORBIDDEN_TARGET`). */
  readonly code: string;
  /** How serious the finding is. */
  readonly severity: RepairIssueSeverity;
  /** Human-readable explanation. */
  readonly message: string;
  /** Identifier of the action that caused the issue, when applicable. */
  readonly actionId?: string;
  /** Target path or property path within the plan, when applicable. */
  readonly path?: string;
}

/** Aggregate outcome of a repair plan validation pass. */
export interface RepairValidationResult {
  /** True when no `error`-severity findings were produced. */
  readonly valid: boolean;
  /** Every finding, in discovery order. */
  readonly issues: readonly RepairValidationIssue[];
  /** Count of `error`-severity findings. */
  readonly errorCount: number;
  /** Count of `warning`-severity findings. */
  readonly warningCount: number;
}

const VALID_ACTION_TYPES = new Set<string>(Object.values(RepairActionType));

/**
 * Validate a repair plan's structural completeness and adherence to safety rules.
 */
export function validateRepairPlan(
  plan: RepairPlan,
  context?: RepairContext,
  policy: RepairPolicy = DEFAULT_REPAIR_POLICY,
): RepairValidationResult {
  const issues: RepairValidationIssue[] = [];

  if (!plan || typeof plan !== 'object') {
    issues.push({
      code: 'REPAIR_PLAN_MISSING',
      severity: 'error',
      message: 'No repair plan supplied for validation.',
    });
    return buildResult(issues);
  }

  checkPlanIdentity(plan, issues);
  checkIssueReferences(plan, issues);
  checkActions(plan, context, policy, issues);

  return buildResult(issues);
}

/** Check plan identity and timestamp fields. */
function checkPlanIdentity(plan: RepairPlan, issues: RepairValidationIssue[]): void {
  if (typeof plan.planId !== 'string' || plan.planId.trim().length === 0) {
    issues.push({
      code: 'REPAIR_MISSING_PLAN_ID',
      severity: 'error',
      message: 'Repair plan has no planId.',
      path: 'planId',
    });
  }
  if (typeof plan.createdAt !== 'string' || plan.createdAt.trim().length === 0) {
    issues.push({
      code: 'REPAIR_MISSING_TIMESTAMP',
      severity: 'error',
      message: 'Repair plan has no createdAt timestamp.',
      path: 'createdAt',
    });
  }
}

/** Check relationship between planned actions and upstream issue references. */
function checkIssueReferences(plan: RepairPlan, issues: RepairValidationIssue[]): void {
  const actions = plan.listActions();
  const refs = plan.listIssueReferences();

  if (actions.length > 0 && refs.length === 0) {
    issues.push({
      code: 'REPAIR_MISSING_ISSUE_REFERENCES',
      severity: 'warning',
      message: 'Repair plan contains actions but no upstream issue references.',
      path: 'issueReferences',
    });
  }
}

/** Check each planned action for completeness, valid types, and policy adherence. */
function checkActions(
  plan: RepairPlan,
  context: RepairContext | undefined,
  policy: RepairPolicy,
  issues: RepairValidationIssue[],
): void {
  const actions = plan.listActions();
  if (actions.length === 0) {
    issues.push({
      code: 'REPAIR_PLAN_EMPTY',
      severity: 'warning',
      message: 'Repair plan contains no planned actions.',
      path: 'actions',
    });
    return;
  }

  const seenIds = new Set<string>();
  for (const action of actions) {
    if (!action || typeof action !== 'object') {
      issues.push({
        code: 'REPAIR_ACTION_INVALID',
        severity: 'error',
        message: 'Action entry is not an object.',
      });
      continue;
    }

    const actionId = action.id ?? 'unknown_action';
    if (seenIds.has(actionId)) {
      issues.push({
        code: 'REPAIR_DUPLICATE_ACTION_ID',
        severity: 'error',
        message: `Duplicate action identifier "${actionId}".`,
        actionId,
      });
    }
    seenIds.add(actionId);

    if (typeof action.description !== 'string' || action.description.trim().length < 5) {
      issues.push({
        code: 'REPAIR_INCOMPLETE_DESCRIPTION',
        severity: 'error',
        message: `Action "${actionId}" has an incomplete or missing description.`,
        actionId,
        path: `${actionId}.description`,
      });
    }

    if (!VALID_ACTION_TYPES.has(action.type as string)) {
      issues.push({
        code: 'REPAIR_INVALID_ACTION_TYPE',
        severity: 'error',
        message: `Action "${actionId}" declares unsupported type "${String(action.type)}".`,
        actionId,
        path: `${actionId}.type`,
      });
    }

    if (!action.target || typeof action.target.path !== 'string' || action.target.path.trim().length === 0) {
      issues.push({
        code: 'REPAIR_INVALID_PATH',
        severity: 'error',
        message: `Action "${actionId}" has an empty or invalid target path.`,
        actionId,
        path: `${actionId}.target.path`,
      });
      continue;
    }

    const policyEval = policy.evaluateAction(action, context);
    if (!policyEval.allowed) {
      for (const violation of policyEval.violations) {
        let code = 'REPAIR_FORBIDDEN_TARGET';
        if (violation.includes('risk')) code = 'REPAIR_EXCESSIVE_RISK';
        else if (violation.includes('forbidden by safety policy')) code = 'REPAIR_FORBIDDEN_ACTION';

        issues.push({
          code,
          severity: 'error',
          message: violation,
          actionId,
          path: `${actionId}.target.path`,
        });
      }
    }
  }
}

/** Build a {@link RepairValidationResult} from an array of issues. */
function buildResult(issues: RepairValidationIssue[]): RepairValidationResult {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
  };
}

/** Render a validation result as human-readable lines. */
export function formatRepairValidation(result: RepairValidationResult): string {
  if (result.issues.length === 0) return 'Repair plan validation passed with no issues.';
  const lines = result.issues.map((issue) => {
    const where = issue.actionId ? ` [Action: ${issue.actionId}]` : issue.path ? ` [${issue.path}]` : '';
    return `  ${issue.severity.toUpperCase()} ${issue.code}${where}: ${issue.message}`;
  });
  return [
    `Repair validation: ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
    ...lines,
  ].join('\n');
}
