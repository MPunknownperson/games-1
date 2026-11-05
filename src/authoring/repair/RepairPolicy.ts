/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairPolicy.ts defines safety rules and evaluation boundaries for proposed
 * repair actions. It checks target paths against allowed and protected
 * patterns, enforces risk ceilings, and blocks dangerous modification types.
 *
 * The policy evaluator is deterministic and pure: it inspects structural
 * action descriptions without performing filesystem or runtime checks.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_PROTECTED_PATHS,
  type RepairContext,
} from './RepairContext';
import {
  RepairActionType,
  RepairRisk,
  riskWeight,
} from './RepairTypes';
import type { RepairAction } from './RepairAction';
import type { RepairPlan } from './RepairPlan';

/** Options accepted when constructing a {@link RepairPolicy}. */
export interface RepairPolicyOptions {
  /** Maximum risk level permitted by this policy. Defaults to `CRITICAL`. */
  readonly maxAllowedRisk?: RepairRisk;
  /** Whether modifying dependency declarations is permitted. Defaults to false. */
  readonly allowDependencyChanges?: boolean;
  /** Whether file deletion/removal actions are permitted. Defaults to false. */
  readonly allowFileRemoval?: boolean;
  /** Custom allowed path patterns overriding context defaults. */
  readonly allowedPathPatterns?: readonly string[];
  /** Custom protected path patterns overriding context defaults. */
  readonly protectedPathPatterns?: readonly string[];
}

/** Result of evaluating a single action against safety rules. */
export interface ActionPolicyResult {
  readonly allowed: boolean;
  readonly violations: readonly string[];
}

/** Result of evaluating an entire repair plan against safety rules. */
export interface PlanPolicyResult {
  readonly allowed: boolean;
  readonly violations: readonly string[];
  readonly blockedActionIds: readonly string[];
  readonly allowedActionIds: readonly string[];
}

/** Default safety policy matching PRESERVE authoring guidelines. */
export const DEFAULT_REPAIR_POLICY_OPTIONS: Readonly<
  Required<Omit<RepairPolicyOptions, 'allowedPathPatterns' | 'protectedPathPatterns'>>
> = {
  maxAllowedRisk: RepairRisk.CRITICAL,
  allowDependencyChanges: false,
  allowFileRemoval: false,
};

/**
 * Evaluates proposed repair actions against structural safety rules.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class RepairPolicy {
  readonly maxAllowedRisk: RepairRisk;
  readonly allowDependencyChanges: boolean;
  readonly allowFileRemoval: boolean;
  readonly customAllowedPaths?: readonly string[];
  readonly customProtectedPaths?: readonly string[];

  constructor(options: RepairPolicyOptions = {}) {
    this.maxAllowedRisk = options.maxAllowedRisk ?? DEFAULT_REPAIR_POLICY_OPTIONS.maxAllowedRisk;
    this.allowDependencyChanges =
      options.allowDependencyChanges ?? DEFAULT_REPAIR_POLICY_OPTIONS.allowDependencyChanges;
    this.allowFileRemoval =
      options.allowFileRemoval ?? DEFAULT_REPAIR_POLICY_OPTIONS.allowFileRemoval;
    this.customAllowedPaths = options.allowedPathPatterns;
    this.customProtectedPaths = options.protectedPathPatterns;
  }

  /**
   * Evaluate a single repair action against safety rules and context boundaries.
   * Returns whether the action is permitted along with any specific violations.
   */
  evaluateAction(action: RepairAction, context?: RepairContext): ActionPolicyResult {
    const violations: string[] = [];

    this.checkRiskCeiling(action, context, violations);
    this.checkActionTypeRestrictions(action, violations);
    this.checkPathBoundaries(action, context, violations);

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Evaluate every action in a repair plan against safety rules.
   * A plan is allowed only if every constituent action is allowed.
   */
  evaluatePlan(plan: RepairPlan, context?: RepairContext): PlanPolicyResult {
    const violations: string[] = [];
    const blockedActionIds: string[] = [];
    const allowedActionIds: string[] = [];

    for (const action of plan.listActions()) {
      const result = this.evaluateAction(action, context);
      if (result.allowed) {
        allowedActionIds.push(action.id);
      } else {
        blockedActionIds.push(action.id);
        for (const v of result.violations) {
          violations.push(`[Action ${action.id}] ${v}`);
        }
      }
    }

    return {
      allowed: blockedActionIds.length === 0 && violations.length === 0,
      violations,
      blockedActionIds,
      allowedActionIds,
    };
  }

  /** Enforce maximum permitted risk level. */
  private checkRiskCeiling(
    action: RepairAction,
    context: RepairContext | undefined,
    violations: string[],
  ): void {
    let cap = this.maxAllowedRisk;
    if (context?.repairMode === 'safe') {
      cap = RepairRisk.MEDIUM;
    }
    if (riskWeight(action.risk) > riskWeight(cap)) {
      violations.push(
        `Action risk (${action.risk}) exceeds maximum permitted risk level (${cap}).`,
      );
    }
  }

  /** Enforce action type restrictions (file removal, dependencies). */
  private checkActionTypeRestrictions(action: RepairAction, violations: string[]): void {
    if (action.type === RepairActionType.DEPENDENCY_CHANGE && !this.allowDependencyChanges) {
      violations.push('Package or module dependency changes are forbidden by safety policy.');
    }
    if (action.type === RepairActionType.REMOVE_FILE && !this.allowFileRemoval) {
      violations.push('File removal actions are forbidden by safety policy.');
    }
  }

  /** Enforce path boundaries (protected runtime vs allowed authoring paths). */
  private checkPathBoundaries(
    action: RepairAction,
    context: RepairContext | undefined,
    violations: string[],
  ): void {
    const targetPath = action.target.path.replace(/\\/g, '/');
    const protectedList =
      this.customProtectedPaths ?? context?.protectedPaths ?? DEFAULT_PROTECTED_PATHS;
    const allowedList =
      this.customAllowedPaths ?? context?.allowedPaths ?? DEFAULT_ALLOWED_PATHS;

    for (const pattern of protectedList) {
      if (matchPathPattern(targetPath, pattern)) {
        violations.push(`Target path "${targetPath}" is protected by safety policy.`);
        return;
      }
    }

    let isAllowed = false;
    for (const pattern of allowedList) {
      if (matchPathPattern(targetPath, pattern)) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      violations.push(`Target path "${targetPath}" does not match any allowed repair path.`);
    }
  }
}

/** Default safety policy instance. */
export const DEFAULT_REPAIR_POLICY = new RepairPolicy();

/**
 * Create a new {@link RepairPolicy}.
 */
export function createRepairPolicy(options?: RepairPolicyOptions): RepairPolicy {
  return new RepairPolicy(options);
}

/** Check whether a path matches a simple glob or directory prefix pattern. */
function matchPathPattern(path: string, pattern: string): boolean {
  const normPath = path.replace(/\\/g, '/');
  const normPat = pattern.replace(/\\/g, '/');

  if (normPat.endsWith('/*') || normPat.endsWith('*')) {
    const prefix = normPat.replace(/\*+$/, '');
    return normPath.startsWith(prefix);
  }
  if (normPat.endsWith('/')) {
    return normPath.startsWith(normPat) || normPath === normPat.slice(0, -1);
  }
  return normPath === normPat || normPath.startsWith(`${normPat}/`);
}
