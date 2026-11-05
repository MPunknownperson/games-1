/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * DecisionReport.ts aggregates multiple DecisionResult evaluations into a
 * combined, deterministic, JSON-serializable report. It partitions decisions by
 * status (approved, review required, rejected) and provides summary statistics.
 *
 * This layer only analyzes and produces decision reports. It never executes
 * repairs, edits files, runs commands, or touches the filesystem.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { DecisionResult } from './DecisionResult';
import { DecisionStatus } from './DecisionTypes';

/** Aggregate summary statistics across a decision evaluation run. */
export interface DecisionReportSummary {
  /** Total number of decisions evaluated. */
  readonly totalDecisions: number;
  /** Number of decisions approved for automatic repair. */
  readonly approvedCount: number;
  /** Number of decisions requiring human review and approval. */
  readonly reviewRequiredCount: number;
  /** Number of decisions rejected by safety policy. */
  readonly rejectedCount: number;
  /** True when all evaluated decisions were approved for automatic repair. */
  readonly allApproved: boolean;
  /** True when no decision was rejected. */
  readonly noRejections: boolean;
}

/** Fully serializable snapshot of a decision report. */
export interface DecisionReportData {
  readonly reportId: string;
  readonly title: string;
  readonly workflowId: string;
  readonly generatedAt: string;
  readonly allDecisions: readonly DecisionResult[];
  readonly approvedItems: readonly DecisionResult[];
  readonly reviewRequiredItems: readonly DecisionResult[];
  readonly rejectedItems: readonly DecisionResult[];
  readonly summary: DecisionReportSummary;
}

/** Options controlling report export and serialization. */
export interface DecisionReportExportOptions {
  /** Fixed ISO-8601 timestamp for byte-stable, reproducible output. */
  readonly timestamp?: string;
  /** Whether to pretty-print JSON output. Defaults to true. */
  readonly pretty?: boolean;
}

/**
 * Builder-style aggregate report for AI decision evaluations.
 * Composition-friendly: instantiate per workflow session or analysis run.
 */
export class DecisionReport {
  readonly reportId: string;
  readonly title: string;
  readonly workflowId: string;
  private readonly decisions: DecisionResult[] = [];

  constructor(
    title = 'AI Decision & Confidence Report',
    workflowId = 'default_workflow',
    reportId?: string,
  ) {
    this.title = title;
    this.workflowId = workflowId;
    this.reportId = reportId ?? `dec_report_${Date.now().toString(36)}`;
  }

  /** Append a single decision result to the report. */
  addDecision(result: DecisionResult): void {
    this.decisions.push(result);
  }

  /** Append multiple decision results to the report. */
  addDecisions(results: readonly DecisionResult[]): void {
    for (const res of results) {
      this.decisions.push(res);
    }
  }

  /** Retrieve all recorded decisions in recording order. */
  getDecisions(): readonly DecisionResult[] {
    return [...this.decisions];
  }

  /** Retrieve only decisions approved for automatic repair. */
  getApprovedItems(): readonly DecisionResult[] {
    return this.decisions.filter((d) => d.status === DecisionStatus.APPROVED);
  }

  /** Retrieve only decisions requiring human review and approval. */
  getReviewRequiredItems(): readonly DecisionResult[] {
    return this.decisions.filter((d) => d.status === DecisionStatus.REVIEW_REQUIRED);
  }

  /** Retrieve only decisions rejected by safety policy. */
  getRejectedItems(): readonly DecisionResult[] {
    return this.decisions.filter((d) => d.status === DecisionStatus.REJECTED);
  }

  /** Compute aggregate summary statistics across all recorded decisions. */
  getSummary(): DecisionReportSummary {
    let approvedCount = 0;
    let reviewRequiredCount = 0;
    let rejectedCount = 0;

    for (const dec of this.decisions) {
      if (dec.status === DecisionStatus.APPROVED) approvedCount += 1;
      else if (dec.status === DecisionStatus.REVIEW_REQUIRED) reviewRequiredCount += 1;
      else if (dec.status === DecisionStatus.REJECTED) rejectedCount += 1;
    }

    const totalDecisions = this.decisions.length;
    return {
      totalDecisions,
      approvedCount,
      reviewRequiredCount,
      rejectedCount,
      allApproved: totalDecisions > 0 && approvedCount === totalDecisions,
      noRejections: rejectedCount === 0,
    };
  }

  /** Whether every recorded decision was approved for automatic repair. */
  isAllApproved(): boolean {
    return this.getSummary().allApproved;
  }

  /** Return a plain, JSON-serializable snapshot of the report. */
  toJSON(options: DecisionReportExportOptions = {}): Readonly<DecisionReportData> {
    return {
      reportId: this.reportId,
      title: this.title,
      workflowId: this.workflowId,
      generatedAt: options.timestamp ?? new Date().toISOString(),
      allDecisions: this.getDecisions(),
      approvedItems: this.getApprovedItems(),
      reviewRequiredItems: this.getReviewRequiredItems(),
      rejectedItems: this.getRejectedItems(),
      summary: this.getSummary(),
    };
  }

  /** Serialize the report to a deterministic JSON string. */
  serialize(options: DecisionReportExportOptions = {}): string {
    return JSON.stringify(this.toJSON(options), null, options.pretty === false ? 0 : 2);
  }

  /** Render a compact, human-readable summary suitable for logs and terminal output. */
  format(): string {
    const s = this.getSummary();
    const lines: string[] = [
      `=== ${this.title} (${this.reportId}) ===`,
      `Workflow: ${this.workflowId}`,
      `Summary:  ${s.approvedCount} Approved | ${s.reviewRequiredCount} Review Required | ${s.rejectedCount} Rejected (Total: ${s.totalDecisions})`,
    ];

    if (this.decisions.length > 0) {
      lines.push('Decisions:');
      for (const dec of this.decisions) {
        lines.push(
          `  [${dec.status}] ${dec.decisionId} (${dec.category}) — Risk: ${dec.riskAssessment.riskLevel} | Confidence: ${dec.confidenceEvaluation.score}`,
        );
        if (dec.reasons.length > 0 && dec.reasons[0]) {
          lines.push(`      Reason: ${dec.reasons[0]}`);
        }
        lines.push(`      Action: ${dec.requiredAction}`);
      }
    }

    return lines.join('\n');
  }
}
