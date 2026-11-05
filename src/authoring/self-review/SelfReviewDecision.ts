/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * SelfReviewDecision.ts produces the final self-review decision by combining
 * the scope evaluation, self-review findings, verification result, attempt
 * history, and retry limits into a {@link SelfReviewDecision}.
 *
 * The decision gate can return APPROVE_REPAIR, ALLOW_RETRY, REQUEST_REVIEW, or
 * STOP_WORKFLOW. It never executes repairs or modifies files.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SelfReviewContext } from './SelfReviewContext';
import type { RepairAttemptTracker } from './RepairAttemptTracker';
import { evaluateRetry } from './RetryController';
import { scopeToRiskLevel } from './ScopeEvaluator';
import type { ScopeEvaluation } from './ScopeEvaluator';
import {
  EscalationReason,
  ReviewDecision,
  ReviewStatus,
  ScopeClassification,
  type ChangeSummary,
  type SelfReviewFinding,
  type SelfReviewDecision as Decision,
  type VerificationResult,
} from './SelfReviewTypes';

/** Input used to produce a self-review decision. */
export interface SelfReviewDecisionInput {
  readonly changeSummary: ChangeSummary;
  readonly scopeEvaluation: ScopeEvaluation;
  readonly findings: readonly SelfReviewFinding[];
  readonly verification?: VerificationResult;
  readonly tracker: RepairAttemptTracker;
}

/**
 * Produce the final self-review decision.
 *
 * Decision rules:
 * - BLOCKED scope, retry limit reached, or repeated failure -> STOP_WORKFLOW.
 * - Verification failed and retry allowed -> ALLOW_RETRY, otherwise STOP_WORKFLOW.
 * - RISKY scope or low confidence -> REQUEST_REVIEW.
 * - SAFE or ACCEPTABLE scope with passing verification -> APPROVE_REPAIR.
 */
export function decideSelfReview(
  input: SelfReviewDecisionInput,
  context: SelfReviewContext,
): Decision {
  const classification = input.scopeEvaluation.classification;
  const findings = input.findings;
  const errorFindings = findings.filter((f) => f.severity === 'error');

  // Blocked scope always stops the workflow.
  if (classification === ScopeClassification.BLOCKED) {
    return buildDecision(
      ReviewDecision.STOP_WORKFLOW,
      ReviewStatus.STOPPED,
      classification,
      input,
      errorFindings.map((f) => f.message),
      'Stop the workflow: the proposed change is blocked by safety policy.',
      collectEscalations(findings, [EscalationReason.PROTECTED_PATH, EscalationReason.DEPENDENCY_CHANGE, EscalationReason.TOO_MANY_FILES, EscalationReason.TOO_MANY_LINES]),
    );
  }

  // Retry limit reached.
  if (input.tracker.isRetryLimitReached(context)) {
    return buildDecision(
      ReviewDecision.STOP_WORKFLOW,
      ReviewStatus.STOPPED,
      classification,
      input,
      [`Retry limit (${context.maximumRetryCount}) reached.`],
      'Stop the workflow: the maximum number of retries has been exhausted.',
      [EscalationReason.MAX_RETRIES_EXCEEDED],
    );
  }

  // Verification supplied and failed.
  if (input.verification && !input.verification.passed) {
    const retry = evaluateRetry(input.tracker, input.changeSummary, context);
    if (retry.allowed) {
      return buildDecision(
        ReviewDecision.ALLOW_RETRY,
        ReviewStatus.NEEDS_REVIEW,
        classification,
        input,
        retry.reasons,
        'Retry the repair attempt after addressing the verification failures.',
        [EscalationReason.VERIFICATION_FAILED],
      );
    }
    return buildDecision(
      ReviewDecision.STOP_WORKFLOW,
      ReviewStatus.STOPPED,
      classification,
      input,
      ['Verification failed and retry is not permitted.', ...retry.reasons],
      'Stop the workflow: verification failed and retry conditions are not met.',
      [EscalationReason.VERIFICATION_FAILED, EscalationReason.REPEATED_FAILURE],
    );
  }

  // RISKY scope requires human review.
  if (classification === ScopeClassification.RISKY) {
    return buildDecision(
      ReviewDecision.REQUEST_REVIEW,
      ReviewStatus.NEEDS_REVIEW,
      classification,
      input,
      errorFindings.map((f) => f.message),
      'Request human review: the proposed change carries architectural or API risk.',
      collectEscalations(findings, [EscalationReason.ARCHITECTURE_CHANGE, EscalationReason.LOW_CONFIDENCE]),
    );
  }

  // SAFE or ACCEPTABLE with passing (or no) verification.
  return buildDecision(
    ReviewDecision.APPROVE_REPAIR,
    ReviewStatus.PASSED,
    classification,
    input,
    ['Change is within safe/acceptable limits and confidence is sufficient.'],
    'Proceed with the controlled repair attempt.',
    [],
  );
}

/** Build a normalized decision object. */
function buildDecision(
  decision: ReviewDecision,
  status: ReviewStatus,
  classification: ScopeClassification,
  input: SelfReviewDecisionInput,
  reasons: readonly string[],
  requiredAction: string,
  escalationReasons: readonly EscalationReason[],
): Decision {
  return {
    decision,
    scope: classification,
    status,
    reasons: [...reasons],
    riskLevel: scopeToRiskLevel(classification),
    confidence: input.changeSummary.confidence,
    requiredAction,
    escalationReasons: [...escalationReasons],
  };
}

/** Collect escalation reasons present in the findings. */
function collectEscalations(
  findings: readonly SelfReviewFinding[],
  interested: readonly EscalationReason[],
): readonly EscalationReason[] {
  const set = new Set<EscalationReason>();
  for (const finding of findings) {
    if (finding.reason && interested.includes(finding.reason)) set.add(finding.reason);
  }
  return Array.from(set).sort();
}
