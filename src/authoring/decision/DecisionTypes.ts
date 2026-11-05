/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * DecisionTypes.ts defines the JSON-serializable shared contracts for
 * decision status, risk level, impact level, confidence level, and decision category.
 *
 * This layer evaluates issues and proposed repairs to produce structured decisions.
 * It does NOT execute repairs, edit files, run commands, call APIs, or modify code.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Outcome status of an AI decision evaluation. */
export const DecisionStatus = {
  /** Automatic repair is safe and permitted without human intervention. */
  APPROVED: 'APPROVED',
  /** Automatic repair is not permitted; human review is required before proceeding. */
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  /** The proposed change is unsafe, forbidden, or invalid and cannot proceed. */
  REJECTED: 'REJECTED',
} as const;

export type DecisionStatus = (typeof DecisionStatus)[keyof typeof DecisionStatus];

/** Evaluated risk level of a proposed change or repair. */
export const RiskLevel = {
  TRIVIAL: 'TRIVIAL',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/** Evaluated architectural and filesystem impact level. */
export const ImpactLevel = {
  SINGLE_FILE: 'SINGLE_FILE',
  MULTIPLE_FILES: 'MULTIPLE_FILES',
  MODULE_LEVEL: 'MODULE_LEVEL',
  SYSTEM_LEVEL: 'SYSTEM_LEVEL',
} as const;

export type ImpactLevel = (typeof ImpactLevel)[keyof typeof ImpactLevel];

/** Evaluated confidence level of an AI assessment or proposed solution. */
export const ConfidenceLevel = {
  VERY_LOW: 'VERY_LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  VERY_HIGH: 'VERY_HIGH',
} as const;

export type ConfidenceLevel = (typeof ConfidenceLevel)[keyof typeof ConfidenceLevel];

/** Categorization of the problem or proposed repair. */
export const DecisionCategory = {
  BUG_FIX: 'BUG_FIX',
  STYLE_FIX: 'STYLE_FIX',
  TYPE_FIX: 'TYPE_FIX',
  CONFIG_FIX: 'CONFIG_FIX',
  ARCHITECTURE_CHANGE: 'ARCHITECTURE_CHANGE',
  DEPENDENCY_CHANGE: 'DEPENDENCY_CHANGE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type DecisionCategory = (typeof DecisionCategory)[keyof typeof DecisionCategory];

/** Numeric weight ordering for risk levels (higher is riskier). */
export function getRiskWeight(risk: RiskLevel): number {
  switch (risk) {
    case RiskLevel.TRIVIAL:
      return 1;
    case RiskLevel.LOW:
      return 2;
    case RiskLevel.MEDIUM:
      return 3;
    case RiskLevel.HIGH:
      return 4;
    case RiskLevel.CRITICAL:
      return 5;
  }
}

/** Return whichever risk level is higher. Ties resolve to `left`. */
export function maxRiskLevel(left: RiskLevel, right: RiskLevel): RiskLevel {
  return getRiskWeight(left) >= getRiskWeight(right) ? left : right;
}

/** Convert a numeric score between 0.0 and 1.0 into a {@link ConfidenceLevel}. */
export function scoreToConfidenceLevel(score: number): ConfidenceLevel {
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  if (clamped >= 0.9) return ConfidenceLevel.VERY_HIGH;
  if (clamped >= 0.8) return ConfidenceLevel.HIGH;
  if (clamped >= 0.6) return ConfidenceLevel.MEDIUM;
  if (clamped >= 0.4) return ConfidenceLevel.LOW;
  return ConfidenceLevel.VERY_LOW;
}
