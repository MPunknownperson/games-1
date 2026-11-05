/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * SelfReviewAnalyzer.ts analyzes proposed repair operations and produces
 * SelfReviewFinding[] records. It detects excessive scope, repeated failed
 * attempts, missing verification evidence, architecture impact, dependency
 * changes, and protected path changes.
 *
 * This is analysis only — it never modifies files or executes anything.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { matchesProtectedArea, type SelfReviewContext } from './SelfReviewContext';
import { evaluateScope, type ScopeEvaluation } from './ScopeEvaluator';
import {
  EscalationReason,
  RepairAttemptStatus,
  createFinding,
  type ChangeSummary,
  type RepairAttempt,
  type SelfReviewFinding,
} from './SelfReviewTypes';

/** Input describing a proposed repair for analysis. */
export interface SelfReviewInput {
  /** Summary of the change footprint being proposed. */
  readonly changeSummary: ChangeSummary;
  /** Immutable history of prior repair attempts. */
  readonly attemptHistory: readonly RepairAttempt[];
  /** Whether verification evidence has been supplied for this proposal. */
  readonly hasVerificationEvidence: boolean;
  /** Whether the root cause is clear (used to flag unclear-cause risk). */
  readonly causeIsClear?: boolean;
}

/** Outcome of self-review analysis. */
export interface SelfReviewOutcome {
  readonly findings: readonly SelfReviewFinding[];
  readonly scopeEvaluation: ScopeEvaluation;
}

/**
 * Analyze a proposed repair and return all detected findings plus the
 * scope evaluation. No modification is performed.
 */
export function analyzeSelfReview(
  input: SelfReviewInput,
  context: SelfReviewContext,
): SelfReviewOutcome {
  const findings: SelfReviewFinding[] = [];
  const change = input.changeSummary;
  const scope = evaluateScope(change, context);
  findings.push(...scope.findings);

  // Protected paths and dependency changes.
  analyzeProtectedPaths(change, context, findings);
  if (change.dependencyChanged) {
    findings.push(createFinding('dependency-change-detected', 'Proposed change modifies dependencies.', {
      reason: EscalationReason.DEPENDENCY_CHANGE, severity: 'error',
    }));
  }

  // Excessive scope.
  if (change.changedFiles > context.maximumChangedFiles) {
    findings.push(createFinding('excessive-files', `Proposed change spans ${change.changedFiles} files (limit ${context.maximumChangedFiles}).`, {
      reason: EscalationReason.TOO_MANY_FILES, severity: 'error',
    }));
  }
  if (change.changedLines > context.maximumChangedLines) {
    findings.push(createFinding('excessive-lines', `Proposed change modifies ${change.changedLines} lines (limit ${context.maximumChangedLines}).`, {
      reason: EscalationReason.TOO_MANY_LINES, severity: 'error',
    }));
  }

  // Confidence.
  if (change.confidence < context.confidenceThreshold) {
    findings.push(createFinding('low-confidence-detected', `Confidence (${change.confidence}) is below threshold (${context.confidenceThreshold}).`, {
      reason: EscalationReason.LOW_CONFIDENCE, severity: 'warning',
    }));
  }

  // Architecture impact.
  if (change.architectureChanged) {
    findings.push(createFinding('architecture-impact', 'Proposed change impacts architecture.', {
      reason: EscalationReason.ARCHITECTURE_CHANGE, severity: 'error',
    }));
  }

  // Unclear cause.
  if (input.causeIsClear === false) {
    findings.push(createFinding('unclear-cause', 'Root cause of the issue is unclear; confidence may be inflated.', {
      severity: 'warning',
    }));
  }

  // Repeated failures.
  analyzeRepeatedFailures(input.attemptHistory, findings);

  // Missing verification evidence.
  if (!input.hasVerificationEvidence) {
    findings.push(createFinding('missing-verification', 'No verification evidence has been supplied for this proposal.', {
      reason: EscalationReason.VERIFICATION_FAILED, severity: 'warning',
    }));
  }

  return { findings, scopeEvaluation: scope };
}

/** Detect repeated failed attempts with the same error pattern. */
function analyzeRepeatedFailures(
  history: readonly RepairAttempt[],
  findings: SelfReviewFinding[],
): void {
  const failures = history.filter((attempt) => attempt.status === RepairAttemptStatus.FAILED);
  if (failures.length === 0) return;

  if (failures.length >= 2) {
    findings.push(createFinding('repeated-failure', `There have been ${failures.length} failed attempts.`, {
      reason: EscalationReason.REPEATED_FAILURE, severity: 'error',
    }));
    return;
  }
  // Detect a repeated identical error summary.
  const lastTwo = failures.slice(-2);
  if (
    lastTwo.length === 2 &&
    lastTwo[0].errorSummary &&
    lastTwo[0].errorSummary === lastTwo[1].errorSummary
  ) {
    findings.push(createFinding('identical-failure', 'The most recent failures share an identical error summary.', {
      reason: EscalationReason.REPEATED_FAILURE, severity: 'error',
    }));
  }
}

/** Detect protected path touches. */
function analyzeProtectedPaths(
  change: ChangeSummary,
  context: SelfReviewContext,
  findings: SelfReviewFinding[],
): void {
  const protectedPaths = change.paths.filter((path) => matchesProtectedArea(path, context.protectedAreas));
  if (protectedPaths.length > 0) {
    findings.push(createFinding('protected-path-detected', `Protected path touched: ${protectedPaths.join(', ')}.`, {
      reason: EscalationReason.PROTECTED_PATH, severity: 'error',
    }));
  }
}
