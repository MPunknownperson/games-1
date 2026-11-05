/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * StageRegistry.ts provides instance-based registration and lookup for
 * execution handlers assigned to architectural pipeline stages.
 *
 * This registry holds no global mutable state — every instance owns its own
 * map of stage handlers. It connects the workflow coordinator to execution
 * steps without importing any runtime, engine, or gameplay code.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  getStageOrderIndex,
  type AgentCapability,
  type PipelineStage,
} from './AIOrchestratorTypes';
import { type AIOrchestratorContext } from './AIOrchestratorContext';
import { type PipelineTask } from './PipelineTask';

/**
 * Execution handler contract for an architectural pipeline stage.
 * Handlers receive the task, execution context, and a dictionary of prior
 * stage results, returning the serializable output artifact for their stage.
 */
export interface StageHandler<TOutput = unknown> {
  /** Architectural pipeline stage this handler executes. */
  readonly stage: PipelineStage;
  /** Stable unique name of the handler implementation (e.g., 'default_schema_handler'). */
  readonly name: string;
  /** Semantic version string of the handler implementation. */
  readonly version: string;
  /** Capabilities provided or required by this handler. */
  readonly capabilities?: readonly AgentCapability[];
  /**
   * Execute the workflow operation described by `task`.
   * Must be deterministic and return JSON-serializable output data.
   */
  execute(
    task: PipelineTask,
    context: AIOrchestratorContext,
    previousResults: Readonly<Record<string, unknown>>,
  ): TOutput | Promise<TOutput>;
}

/** Error raised when registering a handler for a stage that already has one. */
export class DuplicateStageError extends Error {
  readonly stage: PipelineStage;
  constructor(stage: PipelineStage) {
    super(`A stage handler for stage "${stage}" is already registered.`);
    this.name = 'DuplicateStageError';
    this.stage = stage;
  }
}

/**
 * In-memory registry of {@link StageHandler} instances.
 * Composition-friendly: hold an instance; do not subclass or use global state.
 */
export class StageRegistry {
  private readonly handlersByStage = new Map<PipelineStage, StageHandler<unknown>>();

  /**
   * Register an execution handler for a pipeline stage.
   * @throws {DuplicateStageError} if a handler is already registered for `handler.stage`.
   * @throws {Error} if the handler shape is invalid.
   */
  register<TOutput>(handler: StageHandler<TOutput>): StageHandler<TOutput> {
    assertStageHandlerShape(handler as StageHandler<unknown>);
    if (this.handlersByStage.has(handler.stage)) {
      throw new DuplicateStageError(handler.stage);
    }
    this.handlersByStage.set(handler.stage, handler as unknown as StageHandler<unknown>);
    return handler;
  }

  /**
   * Register a handler, replacing any existing handler for that stage.
   */
  set<TOutput>(handler: StageHandler<TOutput>): StageHandler<TOutput> {
    assertStageHandlerShape(handler as StageHandler<unknown>);
    this.handlersByStage.set(handler.stage, handler as unknown as StageHandler<unknown>);
    return handler;
  }

  /** Retrieve the registered handler for a pipeline stage. O(1). */
  get(stage: PipelineStage): StageHandler<unknown> | undefined {
    return this.handlersByStage.get(stage);
  }

  /** Whether a handler is registered for the given pipeline stage. O(1). */
  has(stage: PipelineStage): boolean {
    return this.handlersByStage.has(stage);
  }

  /**
   * Remove the handler registered for `stage`.
   * @returns true when a handler was removed.
   */
  unregister(stage: PipelineStage): boolean {
    return this.handlersByStage.delete(stage);
  }

  /**
   * List all registered stage handlers, sorted deterministically by canonical stage order.
   */
  list(): readonly StageHandler<unknown>[] {
    return Array.from(this.handlersByStage.values()).sort((left, right) =>
      getStageOrderIndex(left.stage) - getStageOrderIndex(right.stage),
    );
  }

  /** List the pipeline stages that currently have registered handlers. */
  stages(): readonly PipelineStage[] {
    return this.list().map((handler) => handler.stage);
  }

  /** Remove all registered stage handlers. */
  clear(): void {
    this.handlersByStage.clear();
  }

  /** Number of registered stage handlers. */
  size(): number {
    return this.handlersByStage.size;
  }
}

/**
 * Verify that a candidate object implements the {@link StageHandler} contract.
 * Throws an `Error` naming every missing or malformed member.
 */
export function assertStageHandlerShape(handler: StageHandler<unknown>): void {
  const problems: string[] = [];
  if (!handler || typeof handler !== 'object') {
    throw new Error('Invalid stage handler: handler must be an object.');
  }
  if (typeof handler.stage !== 'string' || handler.stage.trim().length === 0) {
    problems.push('stage');
  }
  if (typeof handler.name !== 'string' || handler.name.trim().length === 0) {
    problems.push('name');
  }
  if (typeof handler.version !== 'string' || handler.version.trim().length === 0) {
    problems.push('version');
  }
  if (typeof handler.execute !== 'function') {
    problems.push('execute()');
  }
  if (problems.length > 0) {
    throw new Error(`Invalid stage handler. Problems with: ${problems.join(', ')}`);
  }
}
