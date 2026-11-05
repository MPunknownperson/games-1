/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * DecisionResult.ts represents the immutable outcome of an AI decision evaluation.
 * It combines the status, category, risk assessment, impact analysis, confidence
 * evaluation, reasons, and required action into a single serializable object.
 *
 * This layer only analyzes and produces decisions. It never executes repairs,
 * edits files, runs commands, or touches the filesystem.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ConfidenceEvaluation } from './ConfidenceEvaluator';
import { DecisionCategory, DecisionStatus, type RiskLevel } from './DecisionTypes';
import type { ImpactAnalysis } from './ImpactAnalyzer';
import type { RiskAssessment } from './RiskAssessment';

/** Immutable outcome of an AI decision evaluation. */
export interface DecisionResult {
  /** Stable unique identifier for this decision (e.g., 'dec_001'). */
  readonly decisionId: string;
  /** Determined decision status: APPROVED, REVIEW_REQUIRED, or REJECTED. */
  readonly status: DecisionStatus;
  /** Categorization of the problem or proposed repair. */
  readonly category: DecisionCategory;
  /** Structured risk evaluation of the proposed change. */
  readonly riskAssessment: RiskAssessment;
  /** Structured architectural and filesystem impact analysis. */
  readonly impactAnalysis: ImpactAnalysis;
  /** Evaluated AI confidence in the assessment and solution. */
  readonly confidenceEvaluation: ConfidenceEvaluation;
  /** Primary reasons justifying the decision status. */
  readonly reasons: readonly string[];
  /** Action required by the orchestration or repair workflow. */
  readonly requiredAction: string;
  /** ISO-8601 timestamp recorded when this decision was produced. */
  readonly evaluatedAt: string;
}

/** Input accepted when constructing a {@link DecisionResult}. */
export interface DecisionResultInput {
  decisionId?: string;
  status: DecisionStatus;
  category?: DecisionCategory;
  riskAssessment: RiskAssessment;
  impactAnalysis: ImpactAnalysis;
  confidenceEvaluation: ConfidenceEvaluation;
  reasons?: readonly string[];
  requiredAction?: string;
  timestamp?: string;
}

/** Build an immutable {@link DecisionResult} from an input specification. */
export function createDecisionResult(input: DecisionResultInput): DecisionResult {
  const reasons = input.reasons
    ? [...input.reasons]
    : deriveDefaultReasons(input.status, input.riskAssessment.riskLevel, input.confidenceEvaluation.score);

  const requiredAction = input.requiredAction ?? deriveDefaultAction(input.status);

  return {
    decisionId: input.decisionId ?? generateDecisionId(),
    status: input.status,
    category: input.category ?? DecisionCategory.UNKNOWN,
    riskAssessment: {
      ...input.riskAssessment,
      reasons: [...input.riskAssessment.reasons],
      affectedAreas: [...input.riskAssessment.affectedAreas],
    },
    impactAnalysis: { ...input.impactAnalysis },
    confidenceEvaluation: {
      ...input.confidenceEvaluation,
      deductions: [...input.confidenceEvaluation.deductions],
    },
    reasons,
    requiredAction,
    evaluatedAt: input.timestamp ?? new Date().toISOString(),
  };
}

/** Convenience factory for an approved automatic repair decision. */
export function createApprovedDecision(
  riskAssessment: RiskAssessment,
  impactAnalysis: ImpactAnalysis,
  confidenceEvaluation: ConfidenceEvaluation,
  options: {
    decisionId?: string;
    category?: DecisionCategory;
    reasons?: readonly string[];
    requiredAction?: string;
    timestamp?: string;
  } = {},
): DecisionResult {
  return createDecisionResult({
    status: DecisionStatus.APPROVED,
    riskAssessment,
    impactAnalysis,
    confidenceEvaluation,
    ...options,
  });
}

/** Convenience factory for a decision requiring human review and approval. */
export function createReviewDecision(
  riskAssessment: RiskAssessment,
  impactAnalysis: ImpactAnalysis,
  confidenceEvaluation: ConfidenceEvaluation,
  options: {
    decisionId?: string;
    category?: DecisionCategory;
    reasons?: readonly string[];
    requiredAction?: string;
    timestamp?: string;
  } = {},
): DecisionResult {
  return createDecisionResult({
    status: DecisionStatus.REVIEW_REQUIRED,
    riskAssessment,
    impactAnalysis,
    confidenceEvaluation,
    ...options,
  });
}

/** Convenience factory for a rejected decision. */
export function createRejectedDecision(
  riskAssessment: RiskAssessment,
  impactAnalysis: ImpactAnalysis,
  confidenceEvaluation: ConfidenceEvaluation,
  options: {
    decisionId?: string;
    category?: DecisionCategory;
    reasons?: readonly string[];
    requiredAction?: string;
    timestamp?: string;
  } = {},
): DecisionResult {
  return createDecisionResult({
    status: DecisionStatus.REJECTED,
    riskAssessment,
    impactAnalysis,
    confidenceEvaluation,
    ...options,
  });
}

/** Generate a unique decision identifier without relying on global mutable state. */
export function generateDecisionId(): string {
  const anyGlobal = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof anyGlobal.crypto?.randomUUID === 'function') {
    return `dec_${anyGlobal.crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 9);
  return `dec_${Date.now().toString(36)}_${random}`;
}

/** Derive default reasons when omitted by the caller. */
function deriveDefaultReasons(status: DecisionStatus, risk: RiskLevel, conf: number): readonly string[] {
  switch (status) {
    case DecisionStatus.APPROVED:
      return [`Automatic repair approved: risk is ${risk} and confidence is ${conf}.`];
    case DecisionStatus.REVIEW_REQUIRED:
      return [`Human review required: risk (${risk}) or confidence (${conf}) requires confirmation.`];
    case DecisionStatus.REJECTED:
      return [`Proposed repair rejected: risk (${risk}) violates safety boundaries.`];
  }
}

/** Derive default required action when omitted by the caller. */
function deriveDefaultAction(status: DecisionStatus): string {
  switch (status) {
    case DecisionStatus.APPROVED:
      return 'Proceed with automatic repair.';
    case DecisionStatus.REVIEW_REQUIRED:
      return 'Submit proposed repair plan for human review and approval before execution.';
    case DecisionStatus.REJECTED:
      return 'Reject proposed repair and notify user or agent of safety violation.';
  }
}

/** Serialize a {@link DecisionResult} to a deterministic JSON string. */
export function decisionResultToJson(result: DecisionResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
