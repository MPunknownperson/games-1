/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * ScopeEvaluator.ts classifies the scope of a proposed change into one of
 * SAFE, ACCEPTABLE, RISKY, or BLOCKED based on file count, line count, API and
 * dependency impact, architecture impact, confidence, and protected paths.
 *
 * This is analysis only — it never modifies files or executes anything.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  matchesProtectedArea,
  type SelfReviewContext,
} from './SelfReviewContext';
import {
  EscalationReason,
  ScopeClassification,
  createFinding,
  type ChangeSummary,
  type SelfReviewFinding,
} from './SelfReviewTypes';

/** Outcome of scope evaluation. */
export interface ScopeEvaluation {
  readonly classification: ScopeClassification;
  readonly findings: readonly SelfReviewFinding[];
}

/**
 * Classify a proposed change footprint against the review context limits.
 *
 * SAFE: one file, <20 lines, no API/dependency change, confidence >= 0.9.
 * ACCEPTABLE: <=3 files, <=50 lines, confidence >= 0.85 (context threshold).
 * RISKY: architecture or API changes, or unclear cause (low confidence).
 * BLOCKED: runtime/engine/UI modification, dependency change, or excessive scope.
 */
export function evaluateScope(
  change: ChangeSummary,
  context: SelfReviewContext,
): ScopeEvaluation {
  const findings: SelfReviewFinding[] = [];
  const touchesProtected = change.paths.some((path) => matchesProtectedArea(path, context.protectedAreas));

  // BLOCKED checks take precedence.
  if (touchesProtected) {
    findings.push(createFinding('protected-path', 'Change touches a protected runtime/engine/UI path.', {
      reason: EscalationReason.PROTECTED_PATH, severity: 'error',
    }));
    return { classification: ScopeClassification.BLOCKED, findings };
  }
  if (change.dependencyChanged) {
    findings.push(createFinding('dependency-change', 'Change modifies project dependencies.', {
      reason: EscalationReason.DEPENDENCY_CHANGE, severity: 'error',
    }));
    return { classification: ScopeClassification.BLOCKED, findings };
  }
  if (change.changedFiles > context.maximumChangedFiles) {
    findings.push(createFinding('too-many-files', `Change spans ${change.changedFiles} files, exceeding the limit of ${context.maximumChangedFiles}.`, {
      reason: EscalationReason.TOO_MANY_FILES, severity: 'error',
    }));
    return { classification: ScopeClassification.BLOCKED, findings };
  }
  if (change.changedLines > context.maximumChangedLines) {
    findings.push(createFinding('too-many-lines', `Change modifies ${change.changedLines} lines, exceeding the limit of ${context.maximumChangedLines}.`, {
      reason: EscalationReason.TOO_MANY_LINES, severity: 'error',
    }));
    return { classification: ScopeClassification.BLOCKED, findings };
  }

  // RISKY checks.
  if (change.architectureChanged) {
    findings.push(createFinding('architecture-change', 'Change affects architectural boundaries.', {
      reason: EscalationReason.ARCHITECTURE_CHANGE, severity: 'error',
    }));
    return { classification: ScopeClassification.RISKY, findings };
  }
  if (change.apiChanged) {
    findings.push(createFinding('api-change', 'Change modifies public APIs or exported interfaces.', {
      severity: 'warning',
    }));
    return { classification: ScopeClassification.RISKY, findings };
  }
  if (change.confidence < context.confidenceThreshold) {
    findings.push(createFinding('low-confidence', `Confidence (${change.confidence}) is below the threshold (${context.confidenceThreshold}).`, {
      reason: EscalationReason.LOW_CONFIDENCE, severity: 'warning',
    }));
    return { classification: ScopeClassification.RISKY, findings };
  }

  // SAFE checks.
  if (
    change.changedFiles <= 1 &&
    change.changedLines < 20 &&
    !change.apiChanged &&
    !change.dependencyChanged &&
    change.confidence >= 0.9
  ) {
    findings.push(createFinding('safe-scope', 'Change is localized to a single file with high confidence.', {
      severity: 'info',
    }));
    return { classification: ScopeClassification.SAFE, findings };
  }

  // Otherwise ACCEPTABLE.
  findings.push(createFinding('acceptable-scope', 'Change is within acceptable review limits.', {
    severity: 'info',
  }));
  return { classification: ScopeClassification.ACCEPTABLE, findings };
}

/** Derive a coarse risk level string from a scope classification. */
export function scopeToRiskLevel(classification: ScopeClassification): string {
  switch (classification) {
    case ScopeClassification.SAFE:
      return 'TRIVIAL';
    case ScopeClassification.ACCEPTABLE:
      return 'LOW';
    case ScopeClassification.RISKY:
      return 'HIGH';
    case ScopeClassification.BLOCKED:
      return 'CRITICAL';
  }
}
