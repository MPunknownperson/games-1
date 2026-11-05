/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairAction.ts represents a single planned repair action.
 *
 * An action is purely a *description* of what should be modified to resolve a
 * quality or structural issue. It contains no execution logic and MUST NOT
 * edit files or connect to any runtime or filesystem systems.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  RepairRisk,
  riskWeight,
  type RepairActionType,
  type RepairIssueReference,
  type RepairTarget,
} from './RepairTypes';

/**
 * A single planned repair action describing a proposed modification.
 * Descriptive data only — no execution logic, no filesystem handles.
 */
export interface RepairAction {
  /** Stable unique identifier within the repair plan (e.g. `act_001`). */
  readonly id: string;
  /** Type of modification being proposed (e.g. `EDIT_FILE`). */
  readonly type: RepairActionType;
  /** Structural target descriptor where the modification applies. */
  readonly target: RepairTarget;
  /** Concise, human-readable description of what to change. */
  readonly description: string;
  /** Why this modification is being proposed (e.g. "Resolve FILE_TOO_LONG"). */
  readonly reason: string;
  /** Estimated risk level of applying this action. */
  readonly risk: RepairRisk;
  /** Estimated confidence that this action resolves the issue (0..1). */
  readonly confidence: number;
  /** Whether applying this action requires a follow-up verification pass. */
  readonly requiresVerification: boolean;
  /** Optional reference to the specific verification issue addressed. */
  readonly issueReference?: RepairIssueReference;
}

/** Input accepted when constructing a {@link RepairAction}. */
export interface RepairActionInput {
  id: string;
  type: RepairActionType;
  target: RepairTarget;
  description: string;
  reason: string;
  risk?: RepairRisk;
  confidence?: number;
  requiresVerification?: boolean;
  issueReference?: RepairIssueReference;
}

/**
 * Build a {@link RepairAction}.
 * Clamps confidence between 0 and 1 and sets sensible defaults for risk and verification.
 */
export function createRepairAction(input: RepairActionInput): RepairAction {
  const rawConf = input.confidence ?? 0.8;
  const confidence = Number.isFinite(rawConf)
    ? Math.max(0, Math.min(1, rawConf))
    : 0.8;

  return {
    id: input.id,
    type: input.type,
    target: {
      identifier: input.target.identifier,
      path: input.target.path,
      location: input.target.location ? { ...input.target.location } : undefined,
      description: input.target.description,
    },
    description: input.description,
    reason: input.reason,
    risk: input.risk ?? RepairRisk.MEDIUM,
    confidence,
    requiresVerification: input.requiresVerification ?? true,
    issueReference: input.issueReference ? { ...input.issueReference } : undefined,
  };
}

/**
 * Compare two repair actions for deterministic ordering.
 * Sorts primarily by risk (highest risk first), then alphabetically by target path and action id.
 */
export function compareActions(left: RepairAction, right: RepairAction): number {
  const riskDiff = riskWeight(right.risk) - riskWeight(left.risk);
  if (riskDiff !== 0) return riskDiff;
  const pathDiff = left.target.path.localeCompare(right.target.path);
  if (pathDiff !== 0) return pathDiff;
  return left.id.localeCompare(right.id);
}

/**
 * Verify that a candidate object is structurally a valid {@link RepairAction}.
 * Returns an array of error strings describing any missing or malformed fields.
 */
export function validateActionShape(action: unknown): readonly string[] {
  if (!action || typeof action !== 'object') {
    return ['Action must be a non-null object.'];
  }
  const candidate = action as Partial<RepairAction>;
  const errors: string[] = [];

  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    errors.push('Action id is missing or empty.');
  }
  if (typeof candidate.type !== 'string' || candidate.type.trim().length === 0) {
    errors.push('Action type is missing or empty.');
  }
  if (!candidate.target || typeof candidate.target.path !== 'string') {
    errors.push('Action target path is missing.');
  }
  if (typeof candidate.description !== 'string' || candidate.description.trim().length === 0) {
    errors.push('Action description is missing or empty.');
  }
  if (typeof candidate.reason !== 'string' || candidate.reason.trim().length === 0) {
    errors.push('Action reason is missing or empty.');
  }
  if (typeof candidate.risk !== 'string') {
    errors.push('Action risk is missing or invalid.');
  }
  if (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) {
    errors.push('Action confidence must be a number between 0 and 1.');
  }
  if (typeof candidate.requiresVerification !== 'boolean') {
    errors.push('Action requiresVerification must be a boolean.');
  }

  return errors;
}
