/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * PipelinePlan.ts represents a deterministic, ordered execution plan consisting
 * of coordinated workflow tasks. It supports task addition, removal, dependency
 * validation (checking for missing dependencies, cycles, and architectural
 * ordering violations), topological sorting, and JSON serialization.
 *
 * This is pure coordination data. It contains no execution logic and no runtime
 * game references.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  isUpstreamOrEqualStage,
  type PipelineStage,
  type WorkflowMetadata,
} from './AIOrchestratorTypes';
import {
  compareTasksByStage,
  createPipelineTask,
  type PipelineTask,
} from './PipelineTask';

/** Structured outcome of validating a pipeline plan's dependency network. */
export interface PlanValidationResult {
  /** True when the plan contains no missing dependencies, cycles, or stage violations. */
  readonly valid: boolean;
  /** Descriptions of tasks referencing non-existent dependency identifiers. */
  readonly missingDependencies: readonly string[];
  /** Descriptions of circular dependency chains detected in the plan. */
  readonly circularDependencies: readonly string[];
  /** Descriptions of tasks depending on architecturally downstream stages. */
  readonly architecturalViolations: readonly string[];
  /** Combined list of all error messages discovered during validation. */
  readonly errors: readonly string[];
}

/** JSON-serializable snapshot of a {@link PipelinePlan}. */
export interface PipelinePlanData {
  readonly planId: string;
  readonly createdAt: string;
  readonly description: string;
  readonly metadata: WorkflowMetadata;
  readonly tasks: readonly PipelineTask[];
}

/** Options accepted when constructing a {@link PipelinePlan}. */
export interface PipelinePlanOptions {
  readonly planId?: string;
  readonly createdAt?: string;
  readonly description?: string;
  readonly metadata?: WorkflowMetadata;
  readonly tasks?: readonly PipelineTask[];
}

/**
 * Deterministic ordered execution plan for authoring workflow operations.
 * Composition-friendly: instantiate per orchestration session or AI request.
 */
export class PipelinePlan {
  readonly planId: string;
  readonly createdAt: string;
  readonly description: string;
  readonly metadata: WorkflowMetadata;

  private readonly tasksMap = new Map<string, PipelineTask>();

  constructor(options: PipelinePlanOptions = {}) {
    this.planId = options.planId ?? `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    this.createdAt = options.createdAt ?? new Date().toISOString();
    this.description = options.description ?? 'Authoring Orchestration Plan';
    this.metadata = options.metadata ? { ...options.metadata } : {};

    if (options.tasks) {
      for (const task of options.tasks) {
        this.addTask(task);
      }
    }
  }

  /** Add or replace a task in the plan. */
  addTask(task: PipelineTask): void {
    this.tasksMap.set(task.id, task);
  }

  /** Remove a task from the plan by its identifier. Returns true if removed. */
  removeTask(taskId: string): boolean {
    return this.tasksMap.delete(taskId);
  }

  /** Retrieve a task by identifier. O(1). */
  getTask(taskId: string): PipelineTask | undefined {
    return this.tasksMap.get(taskId);
  }

  /** Whether a task with the given identifier exists in the plan. O(1). */
  hasTask(taskId: string): boolean {
    return this.tasksMap.has(taskId);
  }

  /** Total number of tasks in the plan. */
  taskCount(): number {
    return this.tasksMap.size;
  }

  /** List all tasks, sorted deterministically by stage order and identifier. */
  listTasks(): readonly PipelineTask[] {
    return Array.from(this.tasksMap.values()).sort(compareTasksByStage);
  }

  /** List all tasks belonging to a specific architectural pipeline stage. */
  listTasksByStage(stage: PipelineStage): readonly PipelineTask[] {
    return this.listTasks().filter((task) => task.stage === stage);
  }

  /**
   * Remove all tasks belonging to a specific pipeline stage.
   * Returns the number of tasks removed.
   */
  removeStage(stage: PipelineStage): number {
    let removed = 0;
    for (const [id, task] of this.tasksMap.entries()) {
      if (task.stage === stage) {
        this.tasksMap.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Clear all tasks from the plan. */
  clear(): void {
    this.tasksMap.clear();
  }

  /**
   * Validate the plan's dependency structure.
   * Checks for missing dependencies, circular references, and architectural
   * stage order reversals (e.g., an IR task depending on an EXPORT task).
   */
  validateDependencies(): PlanValidationResult {
    const missing: string[] = [];
    const architectural: string[] = [];
    const errors: string[] = [];

    for (const task of this.tasksMap.values()) {
      for (const depId of task.dependencies) {
        const depTask = this.tasksMap.get(depId);
        if (!depTask) {
          const msg = `Task "${task.id}" depends on missing task "${depId}".`;
          missing.push(msg);
          errors.push(msg);
          continue;
        }
        if (!isUpstreamOrEqualStage(depTask.stage, task.stage)) {
          const msg = `Task "${task.id}" (${task.stage}) depends on downstream task "${depId}" (${depTask.stage}).`;
          architectural.push(msg);
          errors.push(msg);
        }
      }
    }

    const circular = this.detectCycles();
    for (const cycleMsg of circular) {
      errors.push(cycleMsg);
    }

    return {
      valid: errors.length === 0,
      missingDependencies: missing,
      circularDependencies: circular,
      architecturalViolations: architectural,
      errors,
    };
  }

  /**
   * Return tasks in a deterministic, topologically sorted execution order.
   * @throws {Error} if the plan contains missing or circular dependencies.
   */
  getOrderedTasks(): readonly PipelineTask[] {
    const validation = this.validateDependencies();
    if (!validation.valid) {
      throw new Error(`Cannot order tasks in invalid plan:\n${validation.errors.join('\n')}`);
    }

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const id of this.tasksMap.keys()) {
      inDegree.set(id, 0);
      dependents.set(id, []);
    }

    for (const task of this.tasksMap.values()) {
      for (const depId of task.dependencies) {
        inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
        dependents.get(depId)?.push(task.id);
      }
    }

    const ready: PipelineTask[] = [];
    for (const [id, count] of inDegree.entries()) {
      if (count === 0) {
        const t = this.tasksMap.get(id);
        if (t) ready.push(t);
      }
    }
    ready.sort(compareTasksByStage);

    const ordered: PipelineTask[] = [];
    while (ready.length > 0) {
      const current = ready.shift() as PipelineTask;
      ordered.push(current);

      const nextIds = dependents.get(current.id) ?? [];
      for (const nextId of nextIds) {
        const count = (inDegree.get(nextId) ?? 0) - 1;
        inDegree.set(nextId, count);
        if (count === 0) {
          const nextTask = this.tasksMap.get(nextId);
          if (nextTask) ready.push(nextTask);
        }
      }
      ready.sort(compareTasksByStage);
    }

    return ordered;
  }

  /** Return a plain, JSON-serializable snapshot of the plan. */
  toJSON(): Readonly<PipelinePlanData> {
    return {
      planId: this.planId,
      createdAt: this.createdAt,
      description: this.description,
      metadata: this.metadata,
      tasks: this.listTasks(),
    };
  }

  /** Serialize the plan to a deterministic JSON string. */
  serialize(pretty = true): string {
    return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0);
  }

  /** Rebuild a {@link PipelinePlan} from serialized snapshot data. */
  static fromData(data: PipelinePlanData): PipelinePlan {
    const plan = new PipelinePlan({
      planId: data.planId,
      createdAt: data.createdAt,
      description: data.description,
      metadata: data.metadata,
    });
    for (const taskData of data.tasks) {
      plan.addTask(createPipelineTask(taskData));
    }
    return plan;
  }

  /** Perform depth-first traversal to detect circular dependency chains. */
  private detectCycles(): string[] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cycles: string[] = [];

    const dfs = (id: string, trail: string[]): void => {
      if (stack.has(id)) {
        cycles.push(`Circular dependency detected: ${[...trail, id].join(' -> ')}`);
        return;
      }
      if (visited.has(id)) return;
      visited.add(id);
      stack.add(id);

      const task = this.tasksMap.get(id);
      if (task) {
        for (const depId of task.dependencies) {
          if (this.tasksMap.has(depId)) dfs(depId, [...trail, id]);
        }
      }
      stack.delete(id);
    };

    for (const id of this.tasksMap.keys()) {
      if (!visited.has(id)) dfs(id, []);
    }
    return cycles;
  }
}
