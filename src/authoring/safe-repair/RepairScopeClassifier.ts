/** Safety classification for analyzed repair findings. */
import type { SafeRepairContext } from './SafeRepairContext';
import { evaluateFinding, type SafeRepairPolicyResult } from './SafeRepairPolicy';
import type { RepairFinding } from './SafeRepairTypes';

/** Classify a finding as automatic, approval-gated, or rejected. */
export function classifyRepairScope(
  finding: RepairFinding,
  context: SafeRepairContext,
): SafeRepairPolicyResult {
  return evaluateFinding(finding, context);
}

/** Classify several findings in deterministic issue-id order. */
export function classifyRepairScopes(
  findings: readonly RepairFinding[],
  context: SafeRepairContext,
): readonly { finding: RepairFinding; classification: SafeRepairPolicyResult }[] {
  return [...findings]
    .sort((a, b) => a.issueId.localeCompare(b.issueId))
    .map((finding) => ({ finding, classification: classifyRepairScope(finding, context) }));
}