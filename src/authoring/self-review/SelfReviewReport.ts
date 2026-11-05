/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * SelfReviewReport.ts aggregates the self-review workflow outcome into a
 * combined, deterministic, JSON-serializable report. It includes workflow
 * status, attempts, decisions, findings, verification summary, and escalation
 * reasons.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { RepairAttemptTracker } from './RepairAttemptTracker';
import type { SelfReviewContext } from './SelfReviewContext';
import type { SelfReviewDecision, VerificationResult } from './SelfReviewTypes';
import {
  ReviewStatus,
  type EscalationReason,
  type RepairAttempt,
  type SelfReviewFinding,
} from './SelfReviewTypes';

/** Aggregate summary of a self-review report. */
export interface SelfReviewReportSummary {
  readonly workflowStatus: ReviewStatus;
  readonly attemptCount: number;
  readonly failedAttempts: number;
  readonly findingCount: number;
  readonly escalationCount: number;
  readonly verificationPassed: boolean;
  readonly success: boolean;
}

/** Fully serializable snapshot of a self-review report. */
export interface SelfReviewReportData {
  readonly reportId: string;
  readonly workflowId: string;
  readonly projectVersion: string;
  readonly generatedAt: string;
  readonly workflowStatus: ReviewStatus;
  readonly attempts: readonly RepairAttempt[];
  readonly decision?: SelfReviewDecision;
  readonly findings: readonly SelfReviewFinding[];
  readonly verification?: VerificationResult;
  readonly escalationReasons: readonly EscalationReason[];
  readonly summary: SelfReviewReportSummary;
}

/** Options controlling report export. */
export interface SelfReviewReportExportOptions {
  readonly timestamp?: string;
  readonly pretty?: boolean;
}

/**
 * Builder-style aggregate report for the self-review workflow.
 * Composition-friendly: instantiate per workflow session.
 */
export class SelfReviewReport {
  readonly reportId: string;
  private readonly context: SelfReviewContext;
  private decision: SelfReviewDecision | undefined;
  private findingsList: SelfReviewFinding[] = [];
  private verificationResult: VerificationResult | undefined;
  private escalationReasonsList: EscalationReason[] = [];

  constructor(
    context: SelfReviewContext,
    reportId?: string,
  ) {
    this.context = context;
    this.reportId = reportId ?? `self_review_${context.workflowId}_${context.timestamp}`;
  }

  /** Attach the final self-review decision. */
  setDecision(decision: SelfReviewDecision): void {
    this.decision = decision;
    this.escalationReasonsList = [...decision.escalationReasons];
  }

  /** Attach self-review findings. */
  setFindings(findings: readonly SelfReviewFinding[]): void {
    this.findingsList = [...findings];
  }

  /** Attach the verification result. */
  setVerification(verification: VerificationResult): void {
    this.verificationResult = verification;
  }

  /** The attached decision, when present. */
  getDecision(): SelfReviewDecision | undefined {
    return this.decision;
  }

  /** The attached findings. */
  getFindings(): readonly SelfReviewFinding[] {
    return [...this.findingsList];
  }

  /** The attached escalation reasons. */
  getEscalationReasons(): readonly EscalationReason[] {
    return [...this.escalationReasonsList];
  }

  /** Compute the aggregate summary given an attempt tracker. */
  getSummary(tracker: RepairAttemptTracker): SelfReviewReportSummary {
    const status = this.decision?.status ?? ReviewStatus.STOPPED;
    return {
      workflowStatus: status,
      attemptCount: tracker.count(),
      failedAttempts: tracker.failedCount(),
      findingCount: this.findingsList.length,
      escalationCount: this.escalationReasonsList.length,
      verificationPassed: this.verificationResult?.passed ?? false,
      success: status === ReviewStatus.PASSED,
    };
  }

  /** Return a plain, JSON-serializable snapshot given an attempt tracker. */
  toJSON(tracker: RepairAttemptTracker, options: SelfReviewReportExportOptions = {}): Readonly<SelfReviewReportData> {
    return {
      reportId: this.reportId,
      workflowId: this.context.workflowId,
      projectVersion: this.context.projectVersion,
      generatedAt: options.timestamp ?? this.context.timestamp,
      workflowStatus: this.decision?.status ?? ReviewStatus.STOPPED,
      attempts: tracker.list(),
      decision: this.decision,
      findings: this.getFindings(),
      verification: this.verificationResult,
      escalationReasons: this.getEscalationReasons(),
      summary: this.getSummary(tracker),
    };
  }

  /** Serialize the report to a deterministic JSON string. */
  serialize(tracker: RepairAttemptTracker, options: SelfReviewReportExportOptions = {}): string {
    return JSON.stringify(this.toJSON(tracker, options), null, options.pretty === false ? 0 : 2);
  }

  /** Render a compact, human-readable summary. */
  format(tracker: RepairAttemptTracker): string {
    const s = this.getSummary(tracker);
    const lines: string[] = [
      `=== Self-Review Report (${this.reportId}) ===`,
      `Workflow:   ${this.context.workflowId}`,
      `Status:     ${s.workflowStatus}`,
      `Attempts:   ${s.attemptCount} (${s.failedAttempts} failed)`,
      `Findings:   ${s.findingCount}`,
      `Escalations: ${s.escalationCount}`,
      `Verification: ${s.verificationPassed ? 'PASSED' : 'NOT PASSED'}`,
    ];
    if (this.decision) {
      lines.push(`Decision:   ${this.decision.decision} (risk ${this.decision.riskLevel}, confidence ${this.decision.confidence})`);
      lines.push(`Action:     ${this.decision.requiredAction}`);
    }
    return lines.join('\n');
  }
}
