/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * RiskAssessment.ts provides structured risk evaluation for detected issues
 * and proposed repairs. It evaluates affected areas against protected runtime
 * boundaries, breaking change possibilities, and estimated complexity.
 *
 * This layer only analyzes and produces risk evaluations. It never executes
 * repairs, edits files, runs commands, or touches the filesystem.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { DEFAULT_DECISION_CONTEXT, matchesPathPattern, type DecisionContext } from './DecisionContext';
import { RiskLevel, maxRiskLevel } from './DecisionTypes';

/** Structured evaluation of the risk associated with a proposed change or repair. */
export interface RiskAssessment {
  /** Evaluated overall risk level. */
  readonly riskLevel: RiskLevel;
  /** Human-readable explanations justifying the assigned risk level. */
  readonly reasons: readonly string[];
  /** Normalized, sorted list of logical file or module paths affected. */
  readonly affectedAreas: readonly string[];
  /** Estimated structural complexity on a scale from 1 (simple) to 10 (invasive). */
  readonly estimatedComplexity: number;
  /** Whether the change has the possibility of introducing public API breaking changes. */
  readonly breakingChangePossibility: boolean;
}

/** Input accepted when evaluating risk with {@link evaluateRisk}. */
export interface RiskAssessmentInput {
  /** Description of the proposed change (e.g., "Rename local variable in one file"). */
  readonly description?: string;
  /** Logical paths or module areas touched by the proposed change. */
  readonly affectedPaths?: readonly string[];
  /** Estimated complexity from 1 to 10. Defaults to 2. */
  readonly estimatedComplexity?: number;
  /** Whether public API breaking changes are possible. Defaults to false. */
  readonly breakingChangePossible?: boolean;
  /** Explicit risk level override or floor. */
  readonly explicitRisk?: RiskLevel;
  /** Additional custom reasons justifying the assessment. */
  readonly explicitReasons?: readonly string[];
}

/**
 * Evaluate the risk of a proposed change against project safety boundaries.
 * Inspects affected areas, complexity, and breaking change potential.
 */
export function evaluateRisk(
  input: RiskAssessmentInput,
  context: DecisionContext = DEFAULT_DECISION_CONTEXT,
): RiskAssessment {
  const affectedAreas = normalizePaths(input.affectedPaths ?? []);
  const reasons: string[] = input.explicitReasons ? [...input.explicitReasons] : [];
  const complexity = clampComplexity(input.estimatedComplexity ?? 2);
  const breaking = input.breakingChangePossible ?? false;

  let risk: RiskLevel = RiskLevel.TRIVIAL;

  if (breaking) {
    reasons.push('Proposed change has public API breaking change possibility.');
    risk = maxRiskLevel(risk, RiskLevel.HIGH);
  }

  risk = checkBoundaryRisks(affectedAreas, context, reasons, risk);
  risk = checkScopeAndComplexityRisks(affectedAreas, complexity, input.description, reasons, risk);

  if (reasons.length === 0) {
    reasons.push(
      input.description
        ? `Low-risk localized modification: "${input.description}".`
        : 'Low-risk localized modification.',
    );
    risk = complexity === 1 && affectedAreas.length <= 1 && !breaking
      ? RiskLevel.TRIVIAL
      : RiskLevel.LOW;
  }

  const finalRisk = input.explicitRisk ? maxRiskLevel(risk, input.explicitRisk) : risk;

  return {
    riskLevel: finalRisk,
    reasons,
    affectedAreas,
    estimatedComplexity: complexity,
    breakingChangePossibility: breaking,
  };
}

/** Check risk contributions from protected or out-of-scope path boundaries. */
function checkBoundaryRisks(
  affectedAreas: readonly string[],
  context: DecisionContext,
  reasons: string[],
  currentRisk: RiskLevel,
): RiskLevel {
  let risk = currentRisk;

  const touchesProtected = affectedAreas.some((path) =>
    matchesPathPattern(path, context.protectedAreas),
  );
  if (touchesProtected) {
    reasons.push('Proposed change touches protected engine, runtime, or UI areas.');
    risk = maxRiskLevel(risk, RiskLevel.CRITICAL);
  }

  const touchesOutsideAllowed = affectedAreas.some((path) =>
    !matchesPathPattern(path, context.allowedAutoRepairScope),
  );
  if (touchesOutsideAllowed && affectedAreas.length > 0) {
    reasons.push('Proposed change touches files outside approved authoring scope.');
    risk = maxRiskLevel(risk, RiskLevel.HIGH);
  }

  return risk;
}

/** Check risk contributions from file span, structural complexity, and description keywords. */
function checkScopeAndComplexityRisks(
  affectedAreas: readonly string[],
  complexity: number,
  description: string | undefined,
  reasons: string[],
  currentRisk: RiskLevel,
): RiskLevel {
  let risk = currentRisk;

  if (affectedAreas.length > 5) {
    reasons.push(`Proposed change spans ${affectedAreas.length} files.`);
    risk = maxRiskLevel(risk, RiskLevel.HIGH);
  } else if (affectedAreas.length > 1) {
    reasons.push(`Proposed change affects multiple files (${affectedAreas.length}).`);
    risk = maxRiskLevel(risk, RiskLevel.MEDIUM);
  }

  if (complexity >= 8) {
    reasons.push(`Estimated structural complexity (${complexity}/10) is high.`);
    risk = maxRiskLevel(risk, RiskLevel.HIGH);
  } else if (complexity >= 5) {
    reasons.push(`Estimated structural complexity (${complexity}/10) is moderate.`);
    risk = maxRiskLevel(risk, RiskLevel.MEDIUM);
  }

  if (description && description.toLowerCase().includes('architecture')) {
    reasons.push('Description indicates architectural modification.');
    risk = maxRiskLevel(risk, RiskLevel.HIGH);
  }

  return risk;
}

/** Clamp estimated complexity to an integer between 1 and 10. */
function clampComplexity(val: number): number {
  if (!Number.isFinite(val) || val < 1) return 1;
  if (val > 10) return 10;
  return Math.floor(val);
}

/** Normalize and sort path strings deterministically. */
function normalizePaths(paths: readonly string[]): readonly string[] {
  const set = new Set(paths.map((p) => p.replace(/\\/g, '/').trim()).filter((p) => p.length > 0));
  return Array.from(set).sort();
}
