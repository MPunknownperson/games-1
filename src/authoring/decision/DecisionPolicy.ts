/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * DecisionPolicy.ts implements the core safety rules governing automatic repair
 * approval and human review requirements.
 *
 * Default automatic repair is permitted ONLY when:
 * - Risk is TRIVIAL or LOW
 * - Impact is SINGLE_FILE
 * - Less than 50 changed lines
 * - No dependency changes
 * - No API changes
 * - No protected path changes
 * - Confidence >= 0.85
 *
 * Anything else requires human review (REVIEW_REQUIRED) or is rejected (REJECTED).
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { DEFAULT_DECISION_CONTEXT, type DecisionContext } from './DecisionContext';
import { DecisionStatus, ImpactLevel, RiskLevel, type DecisionCategory } from './DecisionTypes';

/** Structured input metrics evaluated against safety policy. */
export interface PolicyEvaluationInput {
  /** Evaluated risk level of the change. */
  readonly riskLevel: RiskLevel;
  /** Evaluated architectural and filesystem impact level. */
  readonly impactLevel: ImpactLevel;
  /** Numerical confidence score between 0.0 and 1.0. */
  readonly confidenceScore: number;
  /** Total number of lines modified or proposed to be modified. Defaults to 0. */
  readonly linesChanged?: number;
  /** Whether package or module dependencies are modified. Defaults to false. */
  readonly dependencyChanged?: boolean;
  /** Whether public interfaces or APIs are modified. Defaults to false. */
  readonly apiChanged?: boolean;
  /** Whether the change touches protected runtime, engine, or UI paths. Defaults to false. */
  readonly touchesProtectedAreas?: boolean;
  /** Whether the change targets files outside approved authoring scope. Defaults to false. */
  readonly touchesOutsideAllowedScope?: boolean;
  /** Whether the change is explicitly marked as unsafe or forbidden. Defaults to false. */
  readonly isUnsafeOrForbidden?: boolean;
  /** Categorization of the problem or proposed repair. */
  readonly category?: DecisionCategory;
}

/** Outcome of evaluating a proposed change against safety policy. */
export interface PolicyEvaluationResult {
  /** Determined decision status: APPROVED, REVIEW_REQUIRED, or REJECTED. */
  readonly status: DecisionStatus;
  /** Itemized list of specific policy reasons justifying the decision status. */
  readonly reasons: readonly string[];
  /** Action required by the orchestration or repair workflow. */
  readonly requiredAction: string;
  /** True when automatic repair is permitted without human intervention. */
  readonly isAutoApproved: boolean;
  /** True when human review and approval is mandatory before proceeding. */
  readonly requiresHumanApproval: boolean;
}

/**
 * Evaluate a proposed repair or change against project safety policy.
 *
 * Automatic repair (APPROVED) requires ALL criteria to be met:
 * - TRIVIAL or LOW risk
 * - SINGLE_FILE impact
 * - Lines changed < maxAutoLinesChanged (default 50)
 * - No dependency change (unless explicitly allowed by policy config)
 * - No API change (unless explicitly allowed by policy config)
 * - No protected area touches
 * - Confidence >= minAutoConfidence (default 0.85)
 * - No touches outside allowed scope
 *
 * CRITICAL risk or protected area touches result in REJECTED.
 * Anything else results in REVIEW_REQUIRED.
 */
export function evaluateDecisionPolicy(
  input: PolicyEvaluationInput,
  context: DecisionContext = DEFAULT_DECISION_CONTEXT,
): PolicyEvaluationResult {
  const rejection = checkRejection(input);
  if (rejection) return rejection;

  if (isEligibleForAutoApproval(input, context)) {
    return {
      status: DecisionStatus.APPROVED,
      reasons: [
        'All safety criteria met: trivial/low risk, single file impact, low line count, no API/dependency changes, and high confidence.',
      ],
      requiredAction: 'Proceed with automatic repair.',
      isAutoApproved: true,
      requiresHumanApproval: false,
    };
  }

  const reviewReasons = collectReviewReasons(input, context);
  if (reviewReasons.length === 0) {
    reviewReasons.push('Human review required by policy evaluation guidelines.');
  }

  return {
    status: DecisionStatus.REVIEW_REQUIRED,
    reasons: reviewReasons,
    requiredAction: 'Submit proposed repair plan for human review and approval before execution.',
    isAutoApproved: false,
    requiresHumanApproval: true,
  };
}

/** Check if the input triggers immediate safety rejection (REJECTED). */
function checkRejection(input: PolicyEvaluationInput): PolicyEvaluationResult | null {
  const forbidden = input.isUnsafeOrForbidden ?? false;
  const protectedTouch = input.touchesProtectedAreas ?? false;

  if (forbidden || protectedTouch || input.riskLevel === RiskLevel.CRITICAL) {
    const reasons: string[] = [];
    if (forbidden) reasons.push('Change is explicitly marked as unsafe or forbidden.');
    if (protectedTouch) reasons.push('Change touches protected runtime, engine, or UI paths.');
    if (input.riskLevel === RiskLevel.CRITICAL) reasons.push('Risk level is CRITICAL.');
    return {
      status: DecisionStatus.REJECTED,
      reasons,
      requiredAction: 'Reject proposed repair and notify user or agent of safety violation.',
      isAutoApproved: false,
      requiresHumanApproval: false,
    };
  }
  return null;
}

/** Verify if all criteria hold for automatic repair approval (APPROVED). */
function isEligibleForAutoApproval(
  input: PolicyEvaluationInput,
  context: DecisionContext,
): boolean {
  const lines = Math.max(0, Math.floor(input.linesChanged ?? 0));
  const cfg = context.policyConfiguration;

  const isLowRisk = input.riskLevel === RiskLevel.TRIVIAL || input.riskLevel === RiskLevel.LOW;
  const isSingleFile = input.impactLevel === ImpactLevel.SINGLE_FILE;
  const isLowLines = lines < cfg.maxAutoLinesChanged;
  const isDepSafe = !(input.dependencyChanged ?? false) || cfg.allowAutoWhenDependencyChanged;
  const isApiSafe = !(input.apiChanged ?? false) || cfg.allowAutoWhenApiChanged;
  const isConfHigh = input.confidenceScore >= cfg.minAutoConfidence;
  const isScopeSafe = !(input.touchesOutsideAllowedScope ?? false);

  return isLowRisk && isSingleFile && isLowLines && isDepSafe && isApiSafe && isConfHigh && isScopeSafe;
}

/** Collect itemized reasons explaining why automatic approval was withheld. */
function collectReviewReasons(
  input: PolicyEvaluationInput,
  context: DecisionContext,
): string[] {
  const lines = Math.max(0, Math.floor(input.linesChanged ?? 0));
  const cfg = context.policyConfiguration;
  const reasons: string[] = [];

  if (input.riskLevel !== RiskLevel.TRIVIAL && input.riskLevel !== RiskLevel.LOW) {
    reasons.push(`Risk level (${input.riskLevel}) exceeds automatic repair ceiling (TRIVIAL/LOW).`);
  }
  if (input.impactLevel !== ImpactLevel.SINGLE_FILE) {
    reasons.push(`Impact level (${input.impactLevel}) spans multiple files or module/system boundaries.`);
  }
  if (lines >= cfg.maxAutoLinesChanged) {
    reasons.push(`Changed lines (${lines}) reaches or exceeds automatic threshold (<${cfg.maxAutoLinesChanged}).`);
  }
  if ((input.dependencyChanged ?? false) && !cfg.allowAutoWhenDependencyChanged) {
    reasons.push('Proposed repair modifies project dependencies.');
  }
  if ((input.apiChanged ?? false) && !cfg.allowAutoWhenApiChanged) {
    reasons.push('Proposed repair modifies public interfaces or APIs.');
  }
  if (input.confidenceScore < cfg.minAutoConfidence) {
    reasons.push(`Confidence score (${input.confidenceScore}) is below automatic approval threshold (>=${cfg.minAutoConfidence}).`);
  }
  if (input.touchesOutsideAllowedScope ?? false) {
    reasons.push('Proposed repair targets files outside approved authoring scope.');
  }
  return reasons;
}
