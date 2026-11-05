/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationResult.ts describes the outcome of running one rule against one
 * target. Results are immutable, plain, JSON-serializable data.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  VerificationSeverity,
  VerificationStatus,
  type VerificationCategory,
  type VerificationIssue,
} from './VerificationTypes';

/** Outcome of a single rule execution. */
export interface VerificationResult {
  /** Identifier of the rule that produced this result. */
  readonly ruleId: string;
  /** Human-readable rule name. */
  readonly ruleName: string;
  /** Quality dimension the rule belongs to. */
  readonly category: VerificationCategory;
  /** Label of the target that was inspected. */
  readonly targetLabel: string;
  /** True when the rule produced no `ERROR`-severity findings. */
  readonly passed: boolean;
  /** Lifecycle outcome of the execution. */
  readonly status: VerificationStatus;
  /** `ERROR`-severity findings. */
  readonly issues: readonly VerificationIssue[];
  /** `WARNING`-severity findings. */
  readonly warnings: readonly VerificationIssue[];
  /** `INFO`-severity findings. */
  readonly info: readonly VerificationIssue[];
  /** Wall-clock milliseconds spent executing the rule. */
  readonly durationMs: number;
}

/** Inputs accepted by {@link createVerificationResult}. */
export interface VerificationResultInput {
  ruleId: string;
  ruleName: string;
  category: VerificationCategory;
  targetLabel: string;
  findings: readonly VerificationIssue[];
  durationMs: number;
  status?: VerificationStatus;
}

/**
 * Build a {@link VerificationResult}, partitioning findings by severity and
 * deriving `passed` from the presence of errors.
 */
export function createVerificationResult(
  input: VerificationResultInput,
): VerificationResult {
  const issues: VerificationIssue[] = [];
  const warnings: VerificationIssue[] = [];
  const info: VerificationIssue[] = [];
  for (const finding of input.findings) {
    if (finding.severity === VerificationSeverity.ERROR) issues.push(finding);
    else if (finding.severity === VerificationSeverity.WARNING) warnings.push(finding);
    else info.push(finding);
  }
  const passed = issues.length === 0;
  return {
    ruleId: input.ruleId,
    ruleName: input.ruleName,
    category: input.category,
    targetLabel: input.targetLabel,
    passed,
    status:
      input.status ?? (passed ? VerificationStatus.PASSED : VerificationStatus.FAILED),
    issues,
    warnings,
    info,
    durationMs: input.durationMs,
  };
}

/** Build a skipped result for a rule that did not run. */
export function createSkippedResult(
  ruleId: string,
  ruleName: string,
  category: VerificationCategory,
  targetLabel: string,
): VerificationResult {
  return {
    ruleId,
    ruleName,
    category,
    targetLabel,
    passed: true,
    status: VerificationStatus.SKIPPED,
    issues: [],
    warnings: [],
    info: [],
    durationMs: 0,
  };
}

/** Every finding of a result, ordered errors → warnings → info. */
export function allFindings(result: VerificationResult): readonly VerificationIssue[] {
  return [...result.issues, ...result.warnings, ...result.info];
}

/** Serialize a single result to a JSON string. */
export function resultToJson(result: VerificationResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
