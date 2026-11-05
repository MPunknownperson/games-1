/** Deterministic plan generation for safe, local repair descriptions. */
import type { SafeRepairContext } from './SafeRepairContext';
import { classifyRepairScope } from './RepairScopeClassifier';
import {
  RepairDecision,
  type RepairChange,
  type RepairFinding,
  type SafeRepairPlan,
} from './SafeRepairTypes';

/** Input describing exact local changes proposed for a finding. */
export interface RepairPlanGenerationInput {
  readonly finding: RepairFinding;
  readonly changes: readonly RepairChange[];
  readonly planId?: string;
  readonly timestamp?: string;
}

/**
 * Generate a plan from an analyzed finding and caller-supplied exact changes.
 * This function plans only; it performs no text modification.
 */
export function generateRepairPlan(
  input: RepairPlanGenerationInput,
  context: SafeRepairContext,
): SafeRepairPlan {
  const classification = classifyRepairScope(input.finding, context);
  return {
    planId: input.planId ?? `safe_plan_${sanitizeId(input.finding.issueId)}`,
    finding: cloneFinding(input.finding),
    decision: classification.decision,
    changes: sortChanges(input.changes),
    createdAt: input.timestamp ?? '1970-01-01T00:00:00.000Z',
    approved: classification.decision === RepairDecision.AUTO_FIX_ALLOWED,
    approvalReference: undefined,
  };
}

/**
 * Return a human-approved copy of an approval-gated plan.
 * Approval does not make MODERATE plans eligible for the automatic executor;
 * it records human intent for a future reviewed executor.
 */
export function approveRepairPlan(
  plan: SafeRepairPlan,
  approvalReference: string,
): SafeRepairPlan {
  if (plan.decision === RepairDecision.REJECTED) return plan;
  return { ...plan, approved: true, approvalReference };
}

/** Return changes sorted by path then id for deterministic output. */
function sortChanges(changes: readonly RepairChange[]): readonly RepairChange[] {
  return [...changes].sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    return pathOrder !== 0 ? pathOrder : left.id.localeCompare(right.id);
  });
}

/** Copy a finding so caller-owned arrays cannot mutate the plan. */
function cloneFinding(finding: RepairFinding): RepairFinding {
  return { ...finding, affectedPaths: [...finding.affectedPaths] };
}

/** Convert arbitrary issue identifiers into stable plan-id fragments. */
function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Serialize a plan to deterministic JSON. */
export function safeRepairPlanToJson(plan: SafeRepairPlan, pretty = true): string {
  return JSON.stringify(plan, null, pretty ? 2 : 0);
}