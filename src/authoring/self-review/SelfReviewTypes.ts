/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * SelfReviewTypes.ts defines the JSON-serializable shared contracts used by the
 * controlled AI self-review workflow: review statuses, repair attempt statuses,
 * escalation reasons, findings, change summaries, attempts, and decisions.
 *
 * This layer reviews proposed changes before execution and decides whether a
 * repair attempt should continue, retry, escalate, or stop. It never executes
 * repairs, edits files, runs commands, or touches the runtime game.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Lifecycle status of a self-review workflow evaluation. */
export const ReviewStatus = {
  /** The review passed and the workflow may proceed. */
  PASSED: 'PASSED',
  /** The review failed and the workflow should stop. */
  FAILED: 'FAILED',
  /** The review requires human escalation before proceeding. */
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  /** The workflow was explicitly stopped (limits exceeded or unsafe). */
  STOPPED: 'STOPPED',
} as const;

export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

/** Lifecycle status of a single controlled repair attempt. */
export const RepairAttemptStatus = {
  NOT_STARTED: 'NOT_STARTED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
} as const;

export type RepairAttemptStatus = (typeof RepairAttemptStatus)[keyof typeof RepairAttemptStatus];

/** Why a proposed change was escalated, blocked, or stopped. */
export const EscalationReason = {
  TOO_MANY_FILES: 'TOO_MANY_FILES',
  TOO_MANY_LINES: 'TOO_MANY_LINES',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  ARCHITECTURE_CHANGE: 'ARCHITECTURE_CHANGE',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  REPEATED_FAILURE: 'REPEATED_FAILURE',
  PROTECTED_PATH: 'PROTECTED_PATH',
  DEPENDENCY_CHANGE: 'DEPENDENCY_CHANGE',
  MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED',
  SCOPE_EXPANDED: 'SCOPE_EXPANDED',
} as const;

export type EscalationReason = (typeof EscalationReason)[keyof typeof EscalationReason];

/** Risk classification produced by the scope evaluator. */
export const ScopeClassification = {
  SAFE: 'SAFE',
  ACCEPTABLE: 'ACCEPTABLE',
  RISKY: 'RISKY',
  BLOCKED: 'BLOCKED',
} as const;

export type ScopeClassification = (typeof ScopeClassification)[keyof typeof ScopeClassification];

/** Final decision produced by the self-review decision gate. */
export const ReviewDecision = {
  APPROVE_REPAIR: 'APPROVE_REPAIR',
  ALLOW_RETRY: 'ALLOW_RETRY',
  REQUEST_REVIEW: 'REQUEST_REVIEW',
  STOP_WORKFLOW: 'STOP_WORKFLOW',
} as const;

export type ReviewDecision = (typeof ReviewDecision)[keyof typeof ReviewDecision];

/** One finding produced during self-review analysis. */
export interface SelfReviewFinding {
  /** Stable machine-readable code (e.g., 'excessive-scope'). */
  readonly code: string;
  /** Associated escalation reason, when applicable. */
  readonly reason?: EscalationReason;
  /** Severity of the finding. */
  readonly severity: 'info' | 'warning' | 'error';
  /** Human-readable explanation of what was detected. */
  readonly message: string;
}

/** Structured summary describing the proposed change footprint. */
export interface ChangeSummary {
  /** Number of files proposed to change. */
  readonly changedFiles: number;
  /** Total number of changed lines. */
  readonly changedLines: number;
  /** Logical file paths proposed to change. */
  readonly paths: readonly string[];
  /** Whether public API or exported interfaces are affected. */
  readonly apiChanged: boolean;
  /** Whether dependencies are affected. */
  readonly dependencyChanged: boolean;
  /** Whether architectural boundaries are affected. */
  readonly architectureChanged: boolean;
  /** Estimated AI confidence in the proposed fix (0..1). */
  readonly confidence: number;
}

/** Immutable record of a single controlled repair attempt. */
export interface RepairAttempt {
  /** One-based attempt number. */
  readonly attemptNumber: number;
  /** Status of the attempt. */
  readonly status: RepairAttemptStatus;
  /** Summary of the change scope attempted. */
  readonly changeSummary: ChangeSummary;
  /** Concise error summary, when failed. */
  readonly errorSummary?: string;
  /** Whether verification passed after the attempt. */
  readonly verificationPassed: boolean;
  /** ISO-8601 timestamp recorded when the attempt was logged. */
  readonly recordedAt: string;
}

/** Decision on whether a retry is permitted. */
export interface RetryDecision {
  /** True when a retry is permitted. */
  readonly allowed: boolean;
  /** Decision kind from the {@link ReviewDecision} set. */
  readonly decision: ReviewDecision;
  /** Reasons explaining why the retry was allowed or rejected. */
  readonly reasons: readonly string[];
}

/** Final decision produced by the decision gate. */
export interface SelfReviewDecision {
  /** Decision kind. */
  readonly decision: ReviewDecision;
  /** Scope classification of the proposed change. */
  readonly scope: ScopeClassification;
  /** Overall review status implied by the decision. */
  readonly status: ReviewStatus;
  /** Itemized reasons justifying the decision. */
  readonly reasons: readonly string[];
  /** Overall risk level (TRIVIAL/LOW/MEDIUM/HIGH/CRITICAL). */
  readonly riskLevel: string;
  /** AI confidence score used in the decision (0..1). */
  readonly confidence: number;
  /** Concrete action the workflow must take next. */
  readonly requiredAction: string;
  /** Escalation reasons, when applicable. */
  readonly escalationReasons: readonly EscalationReason[];
}

/** Verification evidence supplied by external tooling. */
export interface VerificationEvidence {
  readonly buildPassed: boolean;
  readonly typeCheckPassed: boolean;
  readonly testsPassed: boolean;
  readonly importIsolationPassed: boolean;
  /** Number of errors reported after the repair attempt. */
  readonly errorsAfter: number;
  /** Actual changed files measured by external tooling. */
  readonly actualChangedFiles: number;
  /** Actual changed lines measured by external tooling. */
  readonly actualChangedLines: number;
}

/** Outcome of evaluating verification evidence. */
export interface VerificationResult {
  readonly passed: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly errors: readonly string[];
}

/** Build a finding. */
export function createFinding(
  code: string,
  message: string,
  options: { reason?: EscalationReason; severity?: 'info' | 'warning' | 'error' } = {},
): SelfReviewFinding {
  return {
    code,
    reason: options.reason,
    severity: options.severity ?? 'warning',
    message,
  };
}
