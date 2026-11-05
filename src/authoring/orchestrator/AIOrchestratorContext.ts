/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * AIOrchestratorContext.ts provides an immutable execution context carrying
 * project version, requested operation, enabled pipeline stages, operational
 * configuration, and workflow metadata into orchestration planners and runners.
 *
 * It contains no reference to engine, UI, gameplay, or filesystem systems —
 * only structural coordination parameters are stored.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  CANONICAL_STAGE_ORDER,
  ExecutionMode,
  type PipelineStage,
  type WorkflowMetadata,
} from './AIOrchestratorTypes';

/** Configurable operational settings for workflow execution. */
export interface OrchestratorConfiguration {
  /** Execution mode governing pipeline running behavior. */
  readonly mode: ExecutionMode;
  /** When true, halt pipeline execution immediately upon any stage failure. */
  readonly stopOnFailure: boolean;
  /** When true, coordinate and plan tasks without invoking stage execution handlers. */
  readonly dryRun: boolean;
  /** Optional time limit in milliseconds for individual task execution. */
  readonly maxTaskDurationMs: number;
}

/** Default operational configuration for the orchestration layer. */
export const DEFAULT_ORCHESTRATOR_CONFIG: Readonly<OrchestratorConfiguration> = {
  mode: ExecutionMode.SEQUENTIAL,
  stopOnFailure: true,
  dryRun: false,
  maxTaskDurationMs: 30000,
};

/**
 * Immutable execution context handed to pipeline planners, runners, and
 * registered stage execution handlers during workflow coordination.
 */
export interface AIOrchestratorContext {
  /** Version of the project or toolchain being orchestrated. */
  readonly projectVersion: string;
  /** Description of the requested operation or user intent. */
  readonly requestedOperation: string;
  /** List of pipeline stages enabled for this orchestration session. */
  readonly enabledStages: readonly PipelineStage[];
  /** Operational execution settings. */
  readonly configuration: OrchestratorConfiguration;
  /** Descriptive metadata attached to the workflow session. */
  readonly metadata: WorkflowMetadata;
}

/** Options accepted when constructing an {@link AIOrchestratorContext}. */
export interface AIOrchestratorContextOptions {
  projectVersion?: string;
  requestedOperation?: string;
  enabledStages?: readonly PipelineStage[];
  configuration?: Partial<OrchestratorConfiguration>;
  metadata?: WorkflowMetadata;
}

/** Default context matching standard PRESERVE orchestration guidelines. */
export const DEFAULT_ORCHESTRATOR_CONTEXT: Readonly<AIOrchestratorContext> = {
  projectVersion: '0.0.0',
  requestedOperation: 'unspecified_operation',
  enabledStages: CANONICAL_STAGE_ORDER,
  configuration: DEFAULT_ORCHESTRATOR_CONFIG,
  metadata: {},
};

/**
 * Build an immutable {@link AIOrchestratorContext}.
 * The returned object is plain data and safe to serialize.
 */
export function createAIOrchestratorContext(
  options: AIOrchestratorContextOptions = {},
): AIOrchestratorContext {
  return {
    projectVersion: options.projectVersion ?? DEFAULT_ORCHESTRATOR_CONTEXT.projectVersion,
    requestedOperation: options.requestedOperation ?? DEFAULT_ORCHESTRATOR_CONTEXT.requestedOperation,
    enabledStages: options.enabledStages
      ? [...options.enabledStages]
      : [...DEFAULT_ORCHESTRATOR_CONTEXT.enabledStages],
    configuration: { ...DEFAULT_ORCHESTRATOR_CONFIG, ...options.configuration },
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/**
 * Return a copy of `context` with the supplied changes applied.
 * The original context is never mutated.
 */
export function withOrchestratorContextChanges(
  context: AIOrchestratorContext,
  changes: AIOrchestratorContextOptions,
): AIOrchestratorContext {
  return {
    projectVersion: changes.projectVersion ?? context.projectVersion,
    requestedOperation: changes.requestedOperation ?? context.requestedOperation,
    enabledStages: changes.enabledStages ? [...changes.enabledStages] : [...context.enabledStages],
    configuration: changes.configuration
      ? { ...context.configuration, ...changes.configuration }
      : context.configuration,
    metadata: changes.metadata ? { ...context.metadata, ...changes.metadata } : context.metadata,
  };
}

/**
 * Check whether a specific pipeline stage is enabled within the given context.
 */
export function isStageEnabled(context: AIOrchestratorContext, stage: PipelineStage): boolean {
  return context.enabledStages.includes(stage);
}
