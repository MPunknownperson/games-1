/** Final reporting for the AI-Assisted Safe Repair workflow. */
import type { SafeRepairPolicyResult } from './SafeRepairPolicy';
import type { RepairVerificationResult } from './RepairVerifier';
import {
  RepairDecision,
  RepairStatus,
  type RepairExecutionOutput,
  type SafeRepairPlan,
} from './SafeRepairTypes';

/** Serializable summary of one complete safe-repair workflow. */
export interface SafeRepairReport {
  readonly reportId: string;
  readonly status: RepairStatus;
  readonly scope: SafeRepairPlan['finding']['scope'];
  readonly risk: SafeRepairPlan['finding']['risk'];
  readonly decision: RepairDecision;
  readonly issueId: string;
  readonly planId: string;
  readonly filesChanged: number;
  readonly linesChanged: number;
  readonly verificationPassed: boolean;
  readonly requiresHumanReview: boolean;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly completedAt: string;
}

/** Inputs used to produce the final workflow report. */
export interface SafeRepairReportInput {
  readonly plan: SafeRepairPlan;
  readonly classification: SafeRepairPolicyResult;
  readonly execution?: RepairExecutionOutput;
  readonly verification?: RepairVerificationResult;
  readonly reportId?: string;
  readonly timestamp?: string;
}

/** Build the final report from planning, execution, and verification outcomes. */
export function createSafeRepairReport(
  input: SafeRepairReportInput,
): SafeRepairReport {
  const status = determineStatus(input);
  const requiresHumanReview =
    input.classification.requiresHumanApproval ||
    input.plan.decision === RepairDecision.REQUIRES_APPROVAL ||
    input.plan.decision === RepairDecision.REJECTED;
  return {
    reportId: input.reportId ?? `repair_report_${sanitize(input.plan.planId)}`,
    status,
    scope: input.plan.finding.scope,
    risk: input.plan.finding.risk,
    decision: input.plan.decision,
    issueId: input.plan.finding.issueId,
    planId: input.plan.planId,
    filesChanged: input.execution?.changedPaths.length ?? 0,
    linesChanged: input.execution?.changedLines ?? 0,
    verificationPassed: input.verification?.passed ?? false,
    requiresHumanReview,
    reasons: [...input.classification.reasons],
    warnings: input.verification ? [...input.verification.warnings] : [],
    errors: collectErrors(input),
    completedAt: input.timestamp ?? '1970-01-01T00:00:00.000Z',
  };
}

/** Determine the final workflow status conservatively. */
function determineStatus(input: SafeRepairReportInput): RepairStatus {
  if (input.plan.decision === RepairDecision.REJECTED) return RepairStatus.REJECTED;
  if (input.plan.decision === RepairDecision.REQUIRES_APPROVAL) {
    return RepairStatus.REQUIRES_HUMAN_REVIEW;
  }
  if (!input.execution) return RepairStatus.PLANNED;
  if (!input.execution.success) return RepairStatus.FAILED;
  if (!input.verification || !input.verification.passed) return RepairStatus.FAILED;
  return RepairStatus.SUCCESS;
}

/** Gather errors from execution and verification in stable order. */
function collectErrors(input: SafeRepairReportInput): readonly string[] {
  const errors: string[] = [];
  if (input.execution) errors.push(...input.execution.errors);
  if (input.verification) errors.push(...input.verification.errors);
  return errors;
}

/** Serialize a report to deterministic JSON. */
export function safeRepairReportToJson(
  report: SafeRepairReport,
  pretty = true,
): string {
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

/** Format a concise human-readable outcome. */
export function formatSafeRepairReport(report: SafeRepairReport): string {
  const lines = [
    'Repair Result:',
    `Status: ${report.status}`,
    `Scope: ${report.scope}`,
    `Risk: ${report.risk}`,
    `Files changed: ${report.filesChanged}`,
    `Lines changed: ${report.linesChanged}`,
    `Verification: ${report.verificationPassed ? 'PASSED' : 'NOT PASSED'}`,
  ];
  if (report.requiresHumanReview) lines.push('Human review: REQUIRED');
  if (report.reasons.length > 0) lines.push(`Reason: ${report.reasons.join(' ')}`);
  return lines.join('\n');
}

/** Sanitize a plan identifier for use in a report identifier. */
function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}