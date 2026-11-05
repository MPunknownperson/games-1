/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairResult.ts represents the outcome of a repair planning or safety
 * validation operation. Results are immutable, plain, JSON-serializable data
 * with no execution logic.
 *
 * This represents planning results ONLY. No code execution or file modification
 * occurs in this layer.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { RepairPlan } from './RepairPlan';
import {
  RepairRisk,
  RepairStatus,
  riskWeight,
} from './RepairTypes';

/**
 * Immutable outcome of a repair planning or validation operation.
 */
export interface RepairResult {
  /** True when the planning operation succeeded and the plan passed safety policy. */
  readonly success: boolean;
  /** Categorised status of the repair plan or session. */
  readonly status: RepairStatus;
  /** The generated repair plan, when one was successfully produced. */
  readonly plan?: RepairPlan;
  /** Advisory findings or non-fatal policy notices. */
  readonly warnings: readonly string[];
  /** Errors that caused planning or safety validation to fail or block. */
  readonly errors: readonly string[];
  /** True when applying the plan requires explicit human review and approval. */
  readonly requiresHumanApproval: boolean;
  /** ISO-8601 timestamp recorded when this result was produced. */
  readonly completedAt: string;
}

/** Input accepted when constructing a {@link RepairResult}. */
export interface RepairResultInput {
  success?: boolean;
  status: RepairStatus;
  plan?: RepairPlan;
  warnings?: readonly string[];
  errors?: readonly string[];
  requiresHumanApproval?: boolean;
  timestamp?: string;
}

/**
 * Build a {@link RepairResult}, automatically deriving `requiresHumanApproval`
 * from action risks if not explicitly specified.
 */
export function createRepairResult(input: RepairResultInput): RepairResult {
  const plan = input.plan;
  const warnings = input.warnings ? [...input.warnings] : [];
  const errors = input.errors ? [...input.errors] : [];
  const success = input.success ?? (input.status === RepairStatus.PLANNED || input.status === RepairStatus.VALIDATED);

  let requiresHumanApproval = input.requiresHumanApproval;
  if (requiresHumanApproval === undefined) {
    requiresHumanApproval = checkRequiresHumanApproval(input.status, plan);
  }

  return {
    success,
    status: input.status,
    plan,
    warnings,
    errors,
    requiresHumanApproval,
    completedAt: input.timestamp ?? new Date().toISOString(),
  };
}

/** Build a successful planning result. */
export function createSuccessRepairResult(
  plan: RepairPlan,
  options: { warnings?: readonly string[]; timestamp?: string } = {},
): RepairResult {
  return createRepairResult({
    status: RepairStatus.PLANNED,
    plan,
    warnings: options.warnings,
    timestamp: options.timestamp,
  });
}

/** Build a blocked planning result (e.g. when safety policy forbids an action). */
export function createBlockedRepairResult(
  errors: readonly string[],
  options: { plan?: RepairPlan; warnings?: readonly string[]; timestamp?: string } = {},
): RepairResult {
  return createRepairResult({
    success: false,
    status: RepairStatus.BLOCKED,
    plan: options.plan,
    warnings: options.warnings,
    errors,
    requiresHumanApproval: true,
    timestamp: options.timestamp,
  });
}

/** Build a failed planning result (e.g. invalid input data or unresolvable issues). */
export function createFailedRepairResult(
  errors: readonly string[],
  options: { warnings?: readonly string[]; timestamp?: string } = {},
): RepairResult {
  return createRepairResult({
    success: false,
    status: RepairStatus.FAILED,
    warnings: options.warnings,
    errors,
    requiresHumanApproval: false,
    timestamp: options.timestamp,
  });
}

/** Serialize a result to a JSON string. */
export function repairResultToJson(result: RepairResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}

/** Check whether a status or plan warrants mandatory human approval. */
function checkRequiresHumanApproval(status: RepairStatus, plan?: RepairPlan): boolean {
  if (status === RepairStatus.BLOCKED) return true;
  if (!plan) return false;

  for (const action of plan.listActions()) {
    if (riskWeight(action.risk) >= riskWeight(RepairRisk.HIGH)) return true;
    if (action.requiresVerification) return true;
  }
  return false;
}
