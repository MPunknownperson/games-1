/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * ConfidenceEvaluator.ts evaluates the confidence score and level of an AI
 * assessment or proposed solution based on problem clarity, solution uniqueness,
 * architectural involvement, and available quality evidence.
 *
 * This layer only analyzes and produces confidence evaluations. It never executes
 * repairs, edits files, runs commands, or touches the filesystem.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { ConfidenceLevel, scoreToConfidenceLevel } from './DecisionTypes';

/** Structured input describing factors affecting AI confidence in a diagnosis or repair. */
export interface ConfidenceInput {
  /** Initial starting score before deductions (0.0 to 1.0). Defaults to 0.95. */
  readonly baseScore?: number;
  /** Whether the root cause of the issue is unclear or ambiguous. Defaults to false. */
  readonly unclearCause?: boolean;
  /** Whether multiple competing valid solutions exist without a clear canonical choice. Defaults to false. */
  readonly multipleSolutions?: boolean;
  /** Whether the repair involves architectural, cross-module, or system boundaries. Defaults to false. */
  readonly architectureInvolvement?: boolean;
  /** Whether verification evidence (build, typecheck, tests) is missing or incomplete. Defaults to false. */
  readonly missingEvidence?: boolean;
  /** Whether the proposed repair touches protected runtime or engine areas. Defaults to false. */
  readonly touchesProtectedAreas?: boolean;
  /** Whether public API breaking changes are possible. Defaults to false. */
  readonly breakingChangePossible?: boolean;
  /** Estimated complexity from 1 to 10. Higher complexity reduces confidence. */
  readonly complexity?: number;
  /** Custom explanation override. */
  readonly customReason?: string;
  /** Explicit confidence score override (0.0 to 1.0). */
  readonly explicitScore?: number;
}

/** Evaluated confidence outcome. */
export interface ConfidenceEvaluation {
  /** Numerical confidence score clamped between 0.0 and 1.0. */
  readonly score: number;
  /** Classified confidence level (VERY_LOW, LOW, MEDIUM, HIGH, VERY_HIGH). */
  readonly level: ConfidenceLevel;
  /** Primary human-readable explanation of the confidence rating. */
  readonly reason: string;
  /** Itemized list of specific factors that caused score deductions. */
  readonly deductions: readonly string[];
}

/**
 * Evaluate AI confidence in a proposed assessment or repair.
 *
 * Starts from a high base score (default 0.95) and applies deductions when:
 * - root cause is unclear
 * - multiple solutions exist
 * - architecture is involved
 * - evidence is missing
 * - protected areas or breaking changes are involved
 */
export function evaluateConfidence(input: ConfidenceInput = {}): ConfidenceEvaluation {
  const deductions: string[] = [];
  let score = input.explicitScore !== undefined
    ? clampScore(input.explicitScore)
    : clampScore(input.baseScore ?? 0.95);

  if (input.explicitScore === undefined) {
    if (input.unclearCause) {
      deductions.push('Root cause is unclear or ambiguous (-0.25).');
      score -= 0.25;
    }
    if (input.multipleSolutions) {
      deductions.push('Multiple competing solutions exist without a clear canonical fix (-0.20).');
      score -= 0.20;
    }
    if (input.architectureInvolvement) {
      deductions.push('Proposed repair involves architectural or cross-module boundaries (-0.30).');
      score -= 0.30;
    }
    if (input.missingEvidence) {
      deductions.push('Verification evidence or test coverage is missing (-0.20).');
      score -= 0.20;
    }
    if (input.touchesProtectedAreas) {
      deductions.push('Proposed change touches protected runtime or engine areas (-0.35).');
      score -= 0.35;
    }
    if (input.breakingChangePossible) {
      deductions.push('Proposed change carries public API breaking change risk (-0.25).');
      score -= 0.25;
    }
    const complexity = input.complexity !== undefined && Number.isFinite(input.complexity)
      ? Math.max(1, Math.min(10, Math.floor(input.complexity)))
      : 1;
    if (complexity > 2) {
      const penalty = Number(((complexity - 2) * 0.04).toFixed(2));
      deductions.push(`Higher structural complexity (${complexity}/10) reduces confidence (-${penalty}).`);
      score -= penalty;
    }
  }

  const finalScore = clampScore(score);
  const level = scoreToConfidenceLevel(finalScore);
  const reason = deriveReason(input.customReason, deductions, finalScore, level);

  return {
    score: finalScore,
    level,
    reason,
    deductions,
  };
}

/** Clamp a score strictly between 0.0 and 1.0, rounded to 2 decimal places. */
function clampScore(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  if (val > 1) return 1;
  return Number(val.toFixed(2));
}

/** Derive a readable explanation from deductions and scores. */
function deriveReason(
  customReason: string | undefined,
  deductions: readonly string[],
  score: number,
  level: ConfidenceLevel,
): string {
  if (customReason && customReason.trim().length > 0) {
    return customReason.trim();
  }
  if (deductions.length === 0) {
    return 'Simple syntax correction with deterministic solution and high certainty.';
  }
  const primary = deductions[0] ? deductions[0].replace(/\s*\(-[\d.]+\)\.?$/, '') : 'multiple risk factors';
  if (deductions.length === 1) {
    return `Confidence (${score}, ${level}) reduced: ${primary}.`;
  }
  return `Confidence (${score}, ${level}) reduced due to ${deductions.length} factors including: ${primary}.`;
}
