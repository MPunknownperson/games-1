/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * AIOrchestratorTypes.ts defines the shared, JSON-serializable contracts used
 * across workflow coordination and pipeline orchestration: task types, pipeline
 * stages, execution statuses, execution modes, agent capabilities, and
 * workflow metadata.
 *
 * This layer coordinates authoring workflow steps only. It contains no runtime
 * game code, no autonomous file modification, and no direct execution of repairs.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/**
 * The architectural stage of the authoring pipeline.
 *
 * Ordered canonically from upstream schema definitions down to final report
 * generation: Schema -> Generator -> IR -> Backend -> Validator -> Preview ->
 * Export -> Verification -> Repair Planning -> Report.
 */
export const PipelineStage = {
  SCHEMA: 'SCHEMA',
  GENERATOR: 'GENERATOR',
  IR: 'IR',
  BACKEND: 'BACKEND',
  VALIDATOR: 'VALIDATOR',
  PREVIEW: 'PREVIEW',
  EXPORT: 'EXPORT',
  VERIFICATION: 'VERIFICATION',
  REPAIR_PLANNING: 'REPAIR_PLANNING',
  REPORT: 'REPORT',
} as const;

/** Union of every supported pipeline stage. */
export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];

/**
 * Canonical architectural execution order for pipeline stages.
 * Dependency validation and plan sorting enforce that workflow tasks follow
 * this strictly unidirectional flow.
 */
export const CANONICAL_STAGE_ORDER: readonly PipelineStage[] = [
  PipelineStage.SCHEMA,
  PipelineStage.GENERATOR,
  PipelineStage.IR,
  PipelineStage.BACKEND,
  PipelineStage.VALIDATOR,
  PipelineStage.PREVIEW,
  PipelineStage.EXPORT,
  PipelineStage.VERIFICATION,
  PipelineStage.REPAIR_PLANNING,
  PipelineStage.REPORT,
];

/** Classification of an individual workflow task operation. */
export const TaskType = {
  CREATE_SCHEMA: 'CREATE_SCHEMA',
  GENERATE_CODE: 'GENERATE_CODE',
  TRANSFORM_IR: 'TRANSFORM_IR',
  TRANSLATE_BACKEND: 'TRANSLATE_BACKEND',
  VALIDATE_STRUCTURE: 'VALIDATE_STRUCTURE',
  BUILD_PREVIEW: 'BUILD_PREVIEW',
  PACKAGE_EXPORT: 'PACKAGE_EXPORT',
  VERIFY_QUALITY: 'VERIFY_QUALITY',
  PLAN_REPAIRS: 'PLAN_REPAIRS',
  SYNTHESIZE_REPORT: 'SYNTHESIZE_REPORT',
  CUSTOM_TASK: 'CUSTOM_TASK',
} as const;

/** Union of every supported task type. */
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

/** Lifecycle status of an individual task, stage, or workflow run. */
export const ExecutionStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  CANCELLED: 'CANCELLED',
} as const;

/** Union of every supported execution status. */
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

/** Operating posture of the orchestration pipeline runner. */
export const ExecutionMode = {
  /** Execute all stages sequentially in strict architectural order. */
  SEQUENTIAL: 'SEQUENTIAL',
  /** Coordinate tasks without invoking stage execution handlers. */
  DRY_RUN: 'DRY_RUN',
  /** Halt workflow immediately upon encountering the first stage failure or warning. */
  STRICT: 'STRICT',
  /** Execute only read-only diagnostic stages (Validator, Preview, Verification, Report). */
  SAFE_DIAGNOSTIC: 'SAFE_DIAGNOSTIC',
} as const;

/** Union of every supported execution mode. */
export type ExecutionMode = (typeof ExecutionMode)[keyof typeof ExecutionMode];

/**
 * Capabilities declared by or required from external AI models or agents when
 * interacting with the orchestration layer.
 */
export const AgentCapability = {
  SCHEMA_AUTHORING: 'SCHEMA_AUTHORING',
  CODE_GENERATION: 'CODE_GENERATION',
  IR_ANALYSIS: 'IR_ANALYSIS',
  BACKEND_TRANSLATION: 'BACKEND_TRANSLATION',
  STRUCTURAL_VALIDATION: 'STRUCTURAL_VALIDATION',
  PREVIEW_INSPECTION: 'PREVIEW_INSPECTION',
  EXPORT_PACKAGING: 'EXPORT_PACKAGING',
  VERIFICATION_AUDIT: 'VERIFICATION_AUDIT',
  REPAIR_RECOMMENDATION: 'REPAIR_RECOMMENDATION',
  REPORT_SYNTHESIS: 'REPORT_SYNTHESIS',
} as const;

/** Union of every supported agent capability. */
export type AgentCapability = (typeof AgentCapability)[keyof typeof AgentCapability];

/**
 * Descriptive, JSON-serializable metadata attached to orchestration workflows,
 * tasks, or execution contexts.
 */
export interface WorkflowMetadata {
  /** Stable workflow or session identifier. */
  readonly sessionId?: string;
  /** Name or identifier of the user, tool, or AI agent initiating the request. */
  readonly initiator?: string;
  /** ISO-8601 timestamp when the workflow was initiated or planned. */
  readonly timestamp?: string;
  /** Categorization and filtering tags. */
  readonly tags?: readonly string[];
  /** Capabilities required to execute this workflow. */
  readonly requiredCapabilities?: readonly AgentCapability[];
  /** Arbitrary, serializable key-value dictionary. */
  readonly customProperties?: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}

/**
 * Convert a pipeline stage into its numeric index in the canonical order.
 * Returns -1 if the stage is unrecognized.
 */
export function getStageOrderIndex(stage: PipelineStage): number {
  return CANONICAL_STAGE_ORDER.indexOf(stage);
}

/**
 * Verify whether stage A is architecturally upstream of or equal to stage B.
 */
export function isUpstreamOrEqualStage(stageA: PipelineStage, stageB: PipelineStage): boolean {
  const indexA = getStageOrderIndex(stageA);
  const indexB = getStageOrderIndex(stageB);
  if (indexA === -1 || indexB === -1) return false;
  return indexA <= indexB;
}
