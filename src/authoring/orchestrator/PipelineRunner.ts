/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * PipelineRunner.ts executes registered pipeline steps according to a
 * deterministic PipelinePlan. It uses dependency injection to obtain stage
 * handlers from a StageRegistry and collects execution results from each
 * stage into an immutable OrchestrationResult.
 *
 * This runner contains no generator or validator logic itself — it only
 * coordinates execution. It does not modify files and does not connect to
 * runtime or filesystem systems.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  ExecutionMode,
  type PipelineStage,
} from './AIOrchestratorTypes';
import {
  DEFAULT_ORCHESTRATOR_CONTEXT,
  type AIOrchestratorContext,
} from './AIOrchestratorContext';
import {
  areDependenciesSatisfied,
  type PipelineTask,
} from './PipelineTask';
import { type PipelinePlan } from './PipelinePlan';
import {
  createFailedOrchestrationResult,
  createOrchestrationResult,
  type OrchestrationResult,
} from './OrchestrationResult';
import { type StageRegistry } from './StageRegistry';

/** Options accepted when executing a workflow plan with {@link PipelineRunner}. */
export interface PipelineRunOptions {
  readonly requestId?: string;
  readonly timestamp?: string;
}

/** High-resolution timestamp in milliseconds, with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Coordinates and executes authoring workflow plans.
 * Composition-friendly: hold an instance initialized with a StageRegistry.
 */
export class PipelineRunner {
  private readonly registry: StageRegistry;

  constructor(registry: StageRegistry) {
    this.registry = registry;
  }

  /** The stage handler registry injected into this runner. */
  getRegistry(): StageRegistry {
    return this.registry;
  }

  /**
   * Execute all tasks in a {@link PipelinePlan} in deterministic topological order.
   * Collects results from each stage into an {@link OrchestrationResult}.
   */
  async runPlan(
    plan: PipelinePlan,
    context: AIOrchestratorContext = DEFAULT_ORCHESTRATOR_CONTEXT,
    options: PipelineRunOptions = {},
  ): Promise<OrchestrationResult> {
    const startMs = nowMs();
    const validation = plan.validateDependencies();
    if (!validation.valid) {
      return createFailedOrchestrationResult(plan.planId, validation.errors, {
        requestId: options.requestId,
        durationMs: nowMs() - startMs,
        timestamp: options.timestamp,
      });
    }

    const orderedTasks = plan.getOrderedTasks();
    const state = {
      completedStages: new Set<PipelineStage>(),
      failedStages: new Set<PipelineStage>(),
      completedTaskIds: new Set<string>(),
      stageResults: {} as Record<string, unknown>,
      warnings: [] as string[],
      errors: [] as string[],
    };

    for (const task of orderedTasks) {
      const halted = await this.executeTaskStep(task, context, state);
      if (halted && context.configuration.stopOnFailure) {
        state.warnings.push(`Execution halted after task "${task.id}" failed.`);
        break;
      }
    }

    return createOrchestrationResult({
      success: state.failedStages.size === 0 && state.errors.length === 0,
      planId: plan.planId,
      requestId: options.requestId,
      completedStages: Array.from(state.completedStages),
      failedStages: Array.from(state.failedStages),
      warnings: state.warnings,
      errors: state.errors,
      stageResults: state.stageResults,
      durationMs: nowMs() - startMs,
      timestamp: options.timestamp,
    });
  }

  /**
   * Execute a single task step. Returns true if execution failed or should halt.
   */
  private async executeTaskStep(
    task: PipelineTask,
    context: AIOrchestratorContext,
    state: {
      completedStages: Set<PipelineStage>;
      failedStages: Set<PipelineStage>;
      completedTaskIds: Set<string>;
      stageResults: Record<string, unknown>;
      warnings: string[];
      errors: string[];
    },
  ): Promise<boolean> {
    if (context.configuration.mode === ExecutionMode.DRY_RUN) {
      return this.handleDryRunTask(task, state);
    }

    if (!areDependenciesSatisfied(task, state.completedTaskIds)) {
      const msg = `Task "${task.id}" skipped: upstream dependencies were not satisfied.`;
      state.errors.push(msg);
      state.failedStages.add(task.stage);
      return true;
    }

    const handler = this.registry.get(task.stage);
    if (!handler) {
      const msg = `No stage handler registered for pipeline stage "${task.stage}".`;
      state.errors.push(msg);
      state.failedStages.add(task.stage);
      return true;
    }

    return this.invokeHandlerSafe(task, handler, context, state);
  }

  /** Handle task execution during DRY_RUN mode. */
  private handleDryRunTask(
    task: PipelineTask,
    state: {
      completedStages: Set<PipelineStage>;
      completedTaskIds: Set<string>;
      stageResults: Record<string, unknown>;
    },
  ): boolean {
    state.completedStages.add(task.stage);
    state.completedTaskIds.add(task.id);
    state.stageResults[task.stage] = {
      dryRun: true,
      stage: task.stage,
      taskId: task.id,
      description: task.description,
    };
    return false;
  }

  /** Invoke a stage handler safely within try/catch blocks. */
  private async invokeHandlerSafe(
    task: PipelineTask,
    handler: { execute(task: PipelineTask, context: AIOrchestratorContext, prior: Record<string, unknown>): unknown | Promise<unknown> },
    context: AIOrchestratorContext,
    state: {
      completedStages: Set<PipelineStage>;
      failedStages: Set<PipelineStage>;
      completedTaskIds: Set<string>;
      stageResults: Record<string, unknown>;
      errors: string[];
    },
  ): Promise<boolean> {
    try {
      const output = await handler.execute(task, context, state.stageResults);
      state.stageResults[task.stage] = output;
      state.completedStages.add(task.stage);
      state.completedTaskIds.add(task.id);
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fullMessage = `Stage "${task.stage}" failed during task "${task.id}": ${errorMessage}`;
      state.errors.push(fullMessage);
      state.failedStages.add(task.stage);
      return true;
    }
  }
}
