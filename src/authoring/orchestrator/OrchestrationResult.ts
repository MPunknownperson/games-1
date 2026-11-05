/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * OrchestrationResult.ts defines the final workflow outcome produced by the
 * PipelineRunner. Results are immutable, plain, JSON-serializable data carrying
 * success state, completed and failed stages, accumulated warnings and errors,
 * and serialized output artifacts.
 *
 * This layer coordinates workflow execution only. It contains no runtime game
 * code, no file modification instructions, and no execution of repairs.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  getStageOrderIndex,
  type PipelineStage,
} from './AIOrchestratorTypes';

/**
 * Immutable final outcome of an authoring orchestration workflow run.
 * Plain data structure supporting deterministic JSON serialization.
 */
export interface OrchestrationResult {
  /** True when the workflow completed all planned stages without blocking errors. */
  readonly success: boolean;
  /** Identifier of the execution plan that produced this result. */
  readonly planId: string;
  /** Identifier of the initiating AI request, when applicable. */
  readonly requestId?: string;
  /** Architectural stages that executed successfully, in canonical order. */
  readonly completedStages: readonly PipelineStage[];
  /** Architectural stages that failed during execution. */
  readonly failedStages: readonly PipelineStage[];
  /** Advisory notices accumulated across all executed stages. */
  readonly warnings: readonly string[];
  /** Errors that caused stage execution or workflow coordination to halt. */
  readonly errors: readonly string[];
  /** Output data artifacts produced by each executed stage, keyed by stage name. */
  readonly stageResults: Readonly<Record<string, unknown>>;
  /** Deterministically serialized JSON representation of the final stage output. */
  readonly serializedOutput: string;
  /** Wall-clock execution duration in milliseconds. */
  readonly durationMs: number;
  /** ISO-8601 timestamp recorded when this orchestration run completed. */
  readonly completedAt: string;
}

/** Input accepted when constructing an {@link OrchestrationResult}. */
export interface OrchestrationResultInput {
  success?: boolean;
  planId: string;
  requestId?: string;
  completedStages?: readonly PipelineStage[];
  failedStages?: readonly PipelineStage[];
  warnings?: readonly string[];
  errors?: readonly string[];
  stageResults?: Record<string, unknown>;
  serializedOutput?: string;
  durationMs: number;
  timestamp?: string;
}

/**
 * Build an immutable {@link OrchestrationResult} from an input specification.
 * Automatically derives `success` from `failedStages` and `errors` if omitted.
 */
export function createOrchestrationResult(
  input: OrchestrationResultInput,
): OrchestrationResult {
  const completedStages = input.completedStages ? sortStages(input.completedStages) : [];
  const failedStages = input.failedStages ? sortStages(input.failedStages) : [];
  const warnings = input.warnings ? [...input.warnings] : [];
  const errors = input.errors ? [...input.errors] : [];
  const stageResults = input.stageResults ? { ...input.stageResults } : {};

  const success =
    input.success ?? (failedStages.length === 0 && errors.length === 0);

  let serializedOutput = input.serializedOutput;
  if (serializedOutput === undefined) {
    serializedOutput = deriveSerializedOutput(completedStages, stageResults);
  }

  return {
    success,
    planId: input.planId,
    requestId: input.requestId,
    completedStages,
    failedStages,
    warnings,
    errors,
    stageResults,
    serializedOutput,
    durationMs: input.durationMs,
    completedAt: input.timestamp ?? new Date().toISOString(),
  };
}

/** Build a successful orchestration workflow result. */
export function createSuccessOrchestrationResult(
  planId: string,
  stageResults: Record<string, unknown>,
  options: {
    requestId?: string;
    completedStages?: readonly PipelineStage[];
    warnings?: readonly string[];
    durationMs?: number;
    timestamp?: string;
  } = {},
): OrchestrationResult {
  return createOrchestrationResult({
    success: true,
    planId,
    requestId: options.requestId,
    completedStages: options.completedStages,
    stageResults,
    warnings: options.warnings,
    durationMs: options.durationMs ?? 0,
    timestamp: options.timestamp,
  });
}

/** Build a failed orchestration workflow result. */
export function createFailedOrchestrationResult(
  planId: string,
  errors: readonly string[],
  options: {
    requestId?: string;
    completedStages?: readonly PipelineStage[];
    failedStages?: readonly PipelineStage[];
    warnings?: readonly string[];
    stageResults?: Record<string, unknown>;
    durationMs?: number;
    timestamp?: string;
  } = {},
): OrchestrationResult {
  return createOrchestrationResult({
    success: false,
    planId,
    requestId: options.requestId,
    completedStages: options.completedStages,
    failedStages: options.failedStages,
    warnings: options.warnings,
    errors,
    stageResults: options.stageResults,
    durationMs: options.durationMs ?? 0,
    timestamp: options.timestamp,
  });
}

/** Serialize an {@link OrchestrationResult} to a deterministic JSON string. */
export function orchestrationResultToJson(result: OrchestrationResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}

/** Sort an array of pipeline stages deterministically by canonical stage order. */
function sortStages(stages: readonly PipelineStage[]): readonly PipelineStage[] {
  return [...stages].sort((left, right) => getStageOrderIndex(left) - getStageOrderIndex(right));
}

/**
 * Derive the serialized output string from the latest completed stage's artifact.
 * Falls back to serializing the entire stageResults dictionary if empty.
 */
function deriveSerializedOutput(
  completedStages: readonly PipelineStage[],
  stageResults: Record<string, unknown>,
): string {
  if (completedStages.length > 0) {
    const lastStage = completedStages[completedStages.length - 1];
    if (lastStage && stageResults[lastStage] !== undefined) {
      const output = stageResults[lastStage];
      if (typeof output === 'string') return output;
      try {
        return JSON.stringify(output, null, 2);
      } catch {
        return String(output);
      }
    }
  }
  try {
    return JSON.stringify(stageResults, null, 2);
  } catch {
    return '{}';
  }
}
