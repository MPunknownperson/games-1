/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * RetryController.ts decides whether a failed repair attempt may be retried.
 * A retry is permitted only when the failure is non-critical, the scope did
 * not increase, confidence remains acceptable, the attempt count is below the
 * limit, and the same failure did not repeat. It never executes repairs.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SelfReviewContext } from './SelfReviewContext';
import { RepairAttemptTracker } from './RepairAttemptTracker';
import {
  EscalationReason,
  RepairAttemptStatus,
  ReviewDecision,
  ReviewStatus,
  type ChangeSummary,
  type RetryDecision,
} from './SelfReviewTypes';

/**
 * Decide whether a retry is permitted after a failed attempt.
 * Returns a {@link RetryDecision}; never throws.
 */
export function evaluateRetry(
  tracker: RepairAttemptTracker,
  proposedChange: ChangeSummary,
  context: SelfReviewContext,
): RetryDecision {
  const reasons: string[] = [];

  if (tracker.isRetryLimitReached(context)) {
    reasons.push(`Retry limit (${context.maximumRetryCount}) reached.`);
    return stop(ReviewDecision.STOP_WORKFLOW, [EscalationReason.MAX_RETRIES_EXCEEDED, EscalationReason.REPEATED_FAILURE], reasons);
  }

  const attempts = tracker.list();
  if (attempts.length === 0) {
    return allow(reasons);
  }

  const lastAttempt = attempts[attempts.length - 1];

  // A blocked attempt is critical and cannot be retried.
  if (lastAttempt.status === RepairAttemptStatus.BLOCKED) {
    reasons.push('Previous attempt was blocked and cannot be retried.');
    return stop(ReviewDecision.STOP_WORKFLOW, [EscalationReason.REPEATED_FAILURE], reasons);
  }

  // Repeated identical failure.
  if (isIdenticalFailureRepeat(attempts, lastAttempt)) {
    reasons.push('The same failure repeated across attempts.');
    return stop(ReviewDecision.STOP_WORKFLOW, [EscalationReason.REPEATED_FAILURE], reasons);
  }

  // Scope expansion check.
  if (scopeExpanded(lastAttempt.changeSummary, proposedChange)) {
    reasons.push('Proposed scope expanded relative to the previous attempt.');
    return stop(ReviewDecision.STOP_WORKFLOW, [EscalationReason.SCOPE_EXPANDED], reasons);
  }

  // Confidence check.
  if (proposedChange.confidence < context.confidenceThreshold) {
    reasons.push(`Confidence (${proposedChange.confidence}) is below the threshold (${context.confidenceThreshold}).`);
    return escalate(reasons);
  }

  // Excessive scope.
  if (proposedChange.changedFiles > context.maximumChangedFiles || proposedChange.changedLines > context.maximumChangedLines) {
    reasons.push('Proposed scope exceeds the configured limits.');
    return stop(ReviewDecision.STOP_WORKFLOW, [EscalationReason.TOO_MANY_FILES, EscalationReason.TOO_MANY_LINES], reasons);
  }

  return allow(reasons);
}

/** Whether the most recent two failures share an identical error summary. */
function isIdenticalFailureRepeat(
  attempts: readonly { status: RepairAttemptStatus; errorSummary?: string }[],
  last: { status: RepairAttemptStatus; errorSummary?: string },
): boolean {
  if (last.status !== RepairAttemptStatus.FAILED) return false;
  const failures = attempts.filter((a) => a.status === RepairAttemptStatus.FAILED);
  if (failures.length < 2) return false;
  const lastTwo = failures.slice(-2);
  return Boolean(lastTwo[0].errorSummary && lastTwo[0].errorSummary === lastTwo[1].errorSummary);
}

/** Whether the proposed scope is larger than the previous attempt. */
function scopeExpanded(previous: ChangeSummary, proposed: ChangeSummary): boolean {
  return proposed.changedFiles > previous.changedFiles || proposed.changedLines > previous.changedLines;
}

/** Build an allowed retry decision. */
function allow(reasons: string[]): RetryDecision {
  const finalReasons = reasons.length > 0 ? reasons : ['Retry permitted: failure is non-critical and scope is stable.'];
  return { allowed: true, decision: ReviewDecision.ALLOW_RETRY, reasons: finalReasons };
}

/** Build a review-required retry decision. */
function escalate(reasons: string[]): RetryDecision {
  return { allowed: false, decision: ReviewDecision.REQUEST_REVIEW, reasons: [...reasons] };
}

/** Build a stop-workflow retry decision. */
function stop(decision: ReviewDecision, _escalation: readonly EscalationReason[], reasons: string[]): RetryDecision {
  void _escalation;
  return { allowed: false, decision, reasons: [...reasons] };
}

/** Convenience: status implied by a retry decision. */
export function retryDecisionStatus(decision: RetryDecision): ReviewStatus {
  if (decision.decision === ReviewDecision.ALLOW_RETRY) return ReviewStatus.NEEDS_REVIEW;
  if (decision.decision === ReviewDecision.STOP_WORKFLOW) return ReviewStatus.STOPPED;
  if (decision.decision === ReviewDecision.REQUEST_REVIEW) return ReviewStatus.NEEDS_REVIEW;
  return ReviewStatus.FAILED;
}
