/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairTypes.ts defines shared repair contracts: risk levels, action types,
 * lifecycle statuses, target descriptors, and issue references.
 *
 * The repair layer is purely a planning and safety validation system. It does
 * NOT execute modifications, edit files, or connect to the runtime game.
 * All types are plain data and JSON-serializable.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** How risky applying a planned repair action is estimated to be. */
export const RepairRisk = {
  /** Mechanical change with minimal behavioural impact. */
  LOW: 'LOW',
  /** Structural change requiring verification or review. */
  MEDIUM: 'MEDIUM',
  /** Invasive change that may alter architectural boundaries or behaviour. */
  HIGH: 'HIGH',
  /** Destructive or sensitive change that requires explicit human approval. */
  CRITICAL: 'CRITICAL',
} as const;

/** Union of every supported risk level. */
export type RepairRisk = (typeof RepairRisk)[keyof typeof RepairRisk];

/** The kind of modification a planned repair action describes. */
export const RepairActionType = {
  /** Modify existing source or authoring data within a file. */
  EDIT_FILE: 'EDIT_FILE',
  /** Create a new file or authoring module. */
  ADD_FILE: 'ADD_FILE',
  /** Remove a file or obsolete artifact. */
  REMOVE_FILE: 'REMOVE_FILE',
  /** Update configuration settings or thresholds. */
  CONFIG_CHANGE: 'CONFIG_CHANGE',
  /** Modify package or module dependency declarations. */
  DEPENDENCY_CHANGE: 'DEPENDENCY_CHANGE',
} as const;

/** Union of every supported action type. */
export type RepairActionType =
  (typeof RepairActionType)[keyof typeof RepairActionType];

/** Lifecycle status of a repair plan or session. */
export const RepairStatus = {
  /** Plan or session has just been instantiated. */
  CREATED: 'CREATED',
  /** Actions have been planned from verification findings. */
  PLANNED: 'PLANNED',
  /** Plan has passed safety and structural validation. */
  VALIDATED: 'VALIDATED',
  /** Plan violates safety policy (e.g. touches protected runtime paths). */
  BLOCKED: 'BLOCKED',
  /** Future executor completed the repair (placeholder for future phases). */
  COMPLETED: 'COMPLETED',
  /** Future executor failed to apply the repair (placeholder for future phases). */
  FAILED: 'FAILED',
} as const;

/** Union of every supported status. */
export type RepairStatus = (typeof RepairStatus)[keyof typeof RepairStatus];

/**
 * Describes where in the project structure a repair action applies.
 * Contains descriptive, structural information only — never filesystem handles.
 */
export interface RepairTarget {
  /** Stable logical identifier of the target (e.g. module or symbol name). */
  readonly identifier: string;
  /** Logical project path (e.g. `src/authoring/backend/TypeScriptEmitter.ts`). */
  readonly path: string;
  /** Specific location within the target, when known. */
  readonly location?: {
    readonly file?: string;
    readonly symbol?: string;
    readonly line?: number;
    readonly column?: number;
  };
  /** Optional human-readable description of the target artifact. */
  readonly description?: string;
}

/**
 * Reference linking a planned repair action back to an upstream verification finding.
 */
export interface RepairIssueReference {
  /** Stable issue code or identifier from verification (e.g. `FILE_TOO_LONG`). */
  readonly issueId: string;
  /** Reported severity of the upstream issue (e.g. `ERROR` or `WARNING`). */
  readonly severity: string;
  /** Explanation of the structural problem reported by verification. */
  readonly message: string;
  /** Originating check or rule name (e.g. `structure.file-size`). */
  readonly source: string;
}

/** Create a structural repair target descriptor. */
export function createRepairTarget(input: {
  identifier: string;
  path: string;
  location?: RepairTarget['location'];
  description?: string;
}): RepairTarget {
  return {
    identifier: input.identifier,
    path: input.path,
    location: input.location ? { ...input.location } : undefined,
    description: input.description,
  };
}

/** Create a reference to an upstream verification issue. */
export function createIssueReference(input: {
  issueId: string;
  severity: string;
  message: string;
  source: string;
}): RepairIssueReference {
  return {
    issueId: input.issueId,
    severity: input.severity,
    message: input.message,
    source: input.source,
  };
}

/** Numeric weight ranking for risk comparison (higher is riskier). */
export function riskWeight(risk: RepairRisk): number {
  switch (risk) {
    case RepairRisk.LOW:
      return 1;
    case RepairRisk.MEDIUM:
      return 2;
    case RepairRisk.HIGH:
      return 3;
    case RepairRisk.CRITICAL:
      return 4;
  }
}

/** Return whichever risk level is higher. Ties resolve to `left`. */
export function maxRisk(left: RepairRisk, right: RepairRisk): RepairRisk {
  return riskWeight(left) >= riskWeight(right) ? left : right;
}
