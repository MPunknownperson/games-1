/** Shared, serializable contracts for the AI-Assisted Safe Repair Layer. */

/** Estimated size and complexity of a repair. */
export const RepairScope = {
  TRIVIAL: 'TRIVIAL',
  SMALL: 'SMALL',
  MODERATE: 'MODERATE',
  LARGE: 'LARGE',
} as const;

/** Union of repair scope values. */
export type RepairScope = (typeof RepairScope)[keyof typeof RepairScope];

/** Estimated risk of a proposed repair. */
export const RepairRisk = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

/** Union of repair risk values. */
export type RepairRisk = (typeof RepairRisk)[keyof typeof RepairRisk];

/** Lifecycle outcome of the safe-repair workflow. */
export const RepairStatus = {
  DETECTED: 'DETECTED',
  PLANNED: 'PLANNED',
  APPROVED: 'APPROVED',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REQUIRES_HUMAN_REVIEW: 'REQUIRES_HUMAN_REVIEW',
  REJECTED: 'REJECTED',
} as const;

/** Union of repair status values. */
export type RepairStatus = (typeof RepairStatus)[keyof typeof RepairStatus];

/** Small, deterministic operations supported by the in-memory executor. */
export const RepairOperation = {
  REPLACE_TEXT: 'REPLACE_TEXT',
  INSERT_TEXT: 'INSERT_TEXT',
  ADD_GUARD: 'ADD_GUARD',
  CORRECT_LOCAL_CODE: 'CORRECT_LOCAL_CODE',
} as const;

/** Union of repair operation values. */
export type RepairOperation = (typeof RepairOperation)[keyof typeof RepairOperation];

/** Safety decision made by the scope classifier. */
export const RepairDecision = {
  AUTO_FIX_ALLOWED: 'AUTO_FIX_ALLOWED',
  REQUIRES_APPROVAL: 'REQUIRES_APPROVAL',
  REJECTED: 'REJECTED',
} as const;

/** Union of classifier decisions. */
export type RepairDecision = (typeof RepairDecision)[keyof typeof RepairDecision];

/** Problem information supplied to the analyzer. */
export interface RepairProblem {
  readonly issueId: string;
  readonly description: string;
  readonly paths: readonly string[];
  readonly estimatedLines: number;
  readonly apiImpact?: boolean;
  readonly dependencyImpact?: boolean;
  readonly architectureImpact?: boolean;
  readonly runtimeImpact?: boolean;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Normalized finding produced by problem analysis. */
export interface RepairFinding {
  readonly issueId: string;
  readonly issue: string;
  readonly affectedPaths: readonly string[];
  readonly affectedFiles: number;
  readonly estimatedChanges: number;
  readonly risk: RepairRisk;
  readonly scope: RepairScope;
  readonly apiImpact: boolean;
  readonly dependencyImpact: boolean;
  readonly architectureImpact: boolean;
  readonly runtimeImpact: boolean;
}

/** One exact, local change proposed by a repair plan. */
export interface RepairChange {
  readonly id: string;
  readonly operation: RepairOperation;
  readonly path: string;
  readonly description: string;
  readonly estimatedLines: number;
  readonly verificationRequired: boolean;
  /** Exact text to locate for replacement or insertion. */
  readonly searchText?: string;
  /** Exact replacement text. */
  readonly replacementText?: string;
  /** Zero-based insertion offset for INSERT_TEXT. */
  readonly insertOffset?: number;
}

/** Serializable plan consumed by policy, executor, and verifier. */
export interface SafeRepairPlan {
  readonly planId: string;
  readonly finding: RepairFinding;
  readonly decision: RepairDecision;
  readonly changes: readonly RepairChange[];
  readonly createdAt: string;
  readonly approved: boolean;
  readonly approvalReference?: string;
}

/** One in-memory document supplied to the executor. */
export interface RepairDocument {
  readonly path: string;
  readonly content: string;
}

/** Outcome of applying an approved plan to in-memory documents. */
export interface RepairExecutionOutput {
  readonly success: boolean;
  readonly status: RepairStatus;
  readonly documents: readonly RepairDocument[];
  readonly changedPaths: readonly string[];
  readonly changedLines: number;
  readonly errors: readonly string[];
}