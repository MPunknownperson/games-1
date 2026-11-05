/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * PipelineTask.ts defines the representation of a single operation within an
 * orchestrated workflow. A task specifies its stage, input reference,
 * expected output, lifecycle status, and dependency task identifiers.
 *
 * This is pure descriptive data used for coordination and planning. It contains
 * no executable logic, no file editing instructions, and no runtime game code.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  ExecutionStatus,
  getStageOrderIndex,
  type PipelineStage,
  type TaskType,
  type WorkflowMetadata,
} from './AIOrchestratorTypes';

/** Reference describing the upstream input data or artifact for a task. */
export interface TaskDataReference {
  /** Source origin or upstream stage identifier (e.g., 'SCHEMA', 'user_request'). */
  readonly sourceOrigin: string;
  /** Identifier of the specific data artifact or payload. */
  readonly artifactId: string;
  /** Optional logical locator or path within the origin data. */
  readonly locator?: string;
  /** Optional inline serializable data payload for direct task input. */
  readonly inlinePayload?: unknown;
}

/** Specification describing the expected output of a pipeline task. */
export interface TaskOutputExpectation {
  /** Logical format or data type expected (e.g., 'SchemaDefinition', 'IRFile'). */
  readonly expectedType: string;
  /** Human-readable explanation of what the task should produce. */
  readonly description: string;
  /** Whether failing to produce this output should abort downstream tasks. */
  readonly mandatory: boolean;
}

/**
 * A single coordinated operation within an authoring workflow pipeline.
 * Plain data structure supporting deterministic serialization and sorting.
 */
export interface PipelineTask {
  /** Stable unique identifier within the pipeline plan (e.g., 'task_001_schema'). */
  readonly id: string;
  /** Architectural pipeline stage this task belongs to. */
  readonly stage: PipelineStage;
  /** Classification of the operation being performed. */
  readonly taskType: TaskType;
  /** Human-readable description of the operation. */
  readonly description: string;
  /** Reference to the input data required by this task. */
  readonly inputReference: TaskDataReference;
  /** Expectation describing what this task must produce. */
  readonly expectedOutput: TaskOutputExpectation;
  /** Current execution lifecycle status. */
  readonly status: ExecutionStatus;
  /** Identifiers of upstream tasks that must complete before this task executes. */
  readonly dependencies: readonly string[];
  /** Optional metadata attached to this task. */
  readonly metadata: WorkflowMetadata;
  /** Error message recorded if the task fails during execution. */
  readonly error?: string;
  /** Execution time in milliseconds, when completed or failed. */
  readonly durationMs?: number;
}

/** Input accepted when constructing a {@link PipelineTask}. */
export interface PipelineTaskInput {
  id: string;
  stage: PipelineStage;
  taskType: TaskType;
  description: string;
  inputReference: TaskDataReference;
  expectedOutput: TaskOutputExpectation;
  status?: ExecutionStatus;
  dependencies?: readonly string[];
  metadata?: WorkflowMetadata;
  error?: string;
  durationMs?: number;
}

/**
 * Build a {@link PipelineTask} from an input specification.
 * Sets sensible defaults for status, dependencies, and metadata.
 */
export function createPipelineTask(input: PipelineTaskInput): PipelineTask {
  return {
    id: input.id,
    stage: input.stage,
    taskType: input.taskType,
    description: input.description,
    inputReference: { ...input.inputReference },
    expectedOutput: { ...input.expectedOutput },
    status: input.status ?? ExecutionStatus.PENDING,
    dependencies: input.dependencies ? [...input.dependencies] : [],
    metadata: input.metadata ? { ...input.metadata } : {},
    error: input.error,
    durationMs: input.durationMs,
  };
}

/**
 * Return a copy of `task` with updated status, error, or timing fields.
 * The original task object is never mutated.
 */
export function withTaskExecutionUpdate(
  task: PipelineTask,
  update: {
    status: ExecutionStatus;
    error?: string;
    durationMs?: number;
  },
): PipelineTask {
  return {
    ...task,
    status: update.status,
    error: update.error !== undefined ? update.error : task.error,
    durationMs: update.durationMs !== undefined ? update.durationMs : task.durationMs,
  };
}

/**
 * Compare two tasks for deterministic ordering.
 * Sorts primarily by architectural stage order, then by dependency count,
 * and finally alphabetically by task id.
 */
export function compareTasksByStage(left: PipelineTask, right: PipelineTask): number {
  const stageDiff = getStageOrderIndex(left.stage) - getStageOrderIndex(right.stage);
  if (stageDiff !== 0) return stageDiff;
  const depDiff = left.dependencies.length - right.dependencies.length;
  if (depDiff !== 0) return depDiff;
  return left.id.localeCompare(right.id);
}

/**
 * Verify whether a task's declared dependencies are satisfied by a set of
 * completed task identifiers.
 */
export function areDependenciesSatisfied(
  task: PipelineTask,
  completedTaskIds: ReadonlySet<string>,
): boolean {
  for (const depId of task.dependencies) {
    if (!completedTaskIds.has(depId)) return false;
  }
  return true;
}
