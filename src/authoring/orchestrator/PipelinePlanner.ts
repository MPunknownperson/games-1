/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * PipelinePlanner.ts is the core planning engine for workflow coordination.
 * It converts user or agent requests (AIRequest) into deterministic, ordered
 * execution plans (PipelinePlan).
 *
 * For example:
 * "Create new enemy asset" -> Schema -> Generator -> Validator -> Preview -> Verification
 *
 * This planner ONLY creates plans. It never executes tasks, never modifies files,
 * and never connects to runtime or filesystem systems.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  CANONICAL_STAGE_ORDER,
  getStageOrderIndex,
  PipelineStage,
  TaskType,
  type WorkflowMetadata,
} from './AIOrchestratorTypes';
import {
  DEFAULT_ORCHESTRATOR_CONTEXT,
  type AIOrchestratorContext,
} from './AIOrchestratorContext';
import { type AIRequest } from './AIRequest';
import { PipelinePlan } from './PipelinePlan';
import { createPipelineTask, type PipelineTask } from './PipelineTask';

/**
 * Converts user requests into coordinated, ordered workflow execution plans.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class PipelinePlanner {
  /**
   * Formulate a {@link PipelinePlan} from an {@link AIRequest}.
   * Inspects intent and requested output to determine required stages, filters
   * through context enabled stages, and wires sequential dependencies.
   */
  createPlan(
    request: AIRequest,
    context: AIOrchestratorContext = DEFAULT_ORCHESTRATOR_CONTEXT,
    options: { planId?: string; timestamp?: string } = {},
  ): PipelinePlan {
    const selectedStages = this.resolveRequiredStages(request, context);
    const plan = new PipelinePlan({
      planId: options.planId,
      createdAt: options.timestamp ?? request.createdAt,
      description: `Plan for request: "${request.intent}"`,
      metadata: {
        sessionId: context.metadata.sessionId,
        initiator: request.metadata.initiator ?? 'ai_orchestrator',
        timestamp: options.timestamp ?? request.createdAt,
        customProperties: {
          requestId: request.requestId,
          intent: request.intent,
          target: request.target,
          requestedOutput: request.requestedOutput,
        },
      },
    });

    let previousTaskId: string | undefined;
    selectedStages.forEach((stage, index) => {
      const task = this.buildTaskForStage(stage, index + 1, request, previousTaskId);
      plan.addTask(task);
      previousTaskId = task.id;
    });

    return plan;
  }

  /**
   * Determine the ordered list of pipeline stages required to fulfill the request.
   */
  private resolveRequiredStages(
    request: AIRequest,
    context: AIOrchestratorContext,
  ): readonly PipelineStage[] {
    let rawStages: ReadonlySet<PipelineStage>;

    if (request.requiredStages && request.requiredStages.length > 0) {
      rawStages = new Set(request.requiredStages);
    } else {
      rawStages = this.inferStagesFromIntent(request);
    }

    const enabledSet = new Set(context.enabledStages);
    return CANONICAL_STAGE_ORDER.filter(
      (stage) => rawStages.has(stage) && enabledSet.has(stage),
    );
  }

  /**
   * Infer necessary pipeline stages by inspecting intent keywords and requested output.
   */
  private inferStagesFromIntent(request: AIRequest): ReadonlySet<PipelineStage> {
    const stages = new Set<PipelineStage>();
    const intentLower = request.intent.toLowerCase();
    const outputLower = request.requestedOutput.toLowerCase();

    const isCreation =
      intentLower.includes('create') ||
      intentLower.includes('new') ||
      intentLower.includes('author') ||
      intentLower.includes('schema') ||
      request.target.includes('.');

    if (isCreation) {
      stages.add(PipelineStage.SCHEMA);
      stages.add(PipelineStage.GENERATOR);
      stages.add(PipelineStage.VALIDATOR);
      stages.add(PipelineStage.PREVIEW);
      stages.add(PipelineStage.VERIFICATION);
    }

    if (
      intentLower.includes('generate') ||
      intentLower.includes('code') ||
      intentLower.includes('typescript') ||
      outputLower.includes('code') ||
      outputLower.includes('file')
    ) {
      stages.add(PipelineStage.GENERATOR);
      stages.add(PipelineStage.IR);
      stages.add(PipelineStage.BACKEND);
      stages.add(PipelineStage.VALIDATOR);
    }

    if (
      intentLower.includes('export') ||
      intentLower.includes('package') ||
      outputLower.includes('export') ||
      outputLower.includes('package')
    ) {
      stages.add(PipelineStage.SCHEMA);
      stages.add(PipelineStage.GENERATOR);
      stages.add(PipelineStage.VALIDATOR);
      stages.add(PipelineStage.PREVIEW);
      stages.add(PipelineStage.EXPORT);
    }

    if (
      intentLower.includes('verify') ||
      intentLower.includes('audit') ||
      intentLower.includes('repair') ||
      intentLower.includes('fix')
    ) {
      stages.add(PipelineStage.VERIFICATION);
      stages.add(PipelineStage.REPAIR_PLANNING);
    }

    if (stages.size === 0) {
      stages.add(PipelineStage.SCHEMA);
      stages.add(PipelineStage.GENERATOR);
      stages.add(PipelineStage.VALIDATOR);
      stages.add(PipelineStage.PREVIEW);
    }

    stages.add(PipelineStage.REPORT);
    return stages;
  }

  /**
   * Build a single {@link PipelineTask} corresponding to an architectural stage.
   */
  private buildTaskForStage(
    stage: PipelineStage,
    stepIndex: number,
    request: AIRequest,
    previousTaskId: string | undefined,
  ): PipelineTask {
    const taskId = `task_${String(stepIndex).padStart(2, '0')}_${stage.toLowerCase()}`;
    const taskType = this.mapStageToTaskType(stage);
    const dependencies = previousTaskId ? [previousTaskId] : [];

    const inputRef = {
      sourceOrigin: previousTaskId ? previousTaskId : 'user_request',
      artifactId: previousTaskId ? `${previousTaskId}_output` : request.requestId,
      locator: request.target,
    };

    const expectedOutput = {
      expectedType: this.mapStageToExpectedOutputType(stage),
      description: `Output artifact produced by stage ${stage} for "${request.target}"`,
      mandatory: stage !== PipelineStage.PREVIEW && stage !== PipelineStage.REPAIR_PLANNING,
    };

    const metadata: WorkflowMetadata = {
      initiator: request.metadata.initiator ?? 'ai_orchestrator',
      timestamp: request.createdAt,
      customProperties: {
        stageIndex: getStageOrderIndex(stage),
        target: request.target,
      },
    };

    return createPipelineTask({
      id: taskId,
      stage,
      taskType,
      description: `Execute ${stage} stage for target "${request.target}"`,
      inputReference: inputRef,
      expectedOutput,
      dependencies,
      metadata,
    });
  }

  /** Map an architectural stage to its primary task type. */
  private mapStageToTaskType(stage: PipelineStage): TaskType {
    switch (stage) {
      case PipelineStage.SCHEMA: return TaskType.CREATE_SCHEMA;
      case PipelineStage.GENERATOR: return TaskType.GENERATE_CODE;
      case PipelineStage.IR: return TaskType.TRANSFORM_IR;
      case PipelineStage.BACKEND: return TaskType.TRANSLATE_BACKEND;
      case PipelineStage.VALIDATOR: return TaskType.VALIDATE_STRUCTURE;
      case PipelineStage.PREVIEW: return TaskType.BUILD_PREVIEW;
      case PipelineStage.EXPORT: return TaskType.PACKAGE_EXPORT;
      case PipelineStage.VERIFICATION: return TaskType.VERIFY_QUALITY;
      case PipelineStage.REPAIR_PLANNING: return TaskType.PLAN_REPAIRS;
      case PipelineStage.REPORT: return TaskType.SYNTHESIZE_REPORT;
    }
  }

  /** Map an architectural stage to its expected output data type string. */
  private mapStageToExpectedOutputType(stage: PipelineStage): string {
    switch (stage) {
      case PipelineStage.SCHEMA: return 'SchemaDefinition';
      case PipelineStage.GENERATOR: return 'GenerationRequest';
      case PipelineStage.IR: return 'IRModule';
      case PipelineStage.BACKEND: return 'GenerationResult';
      case PipelineStage.VALIDATOR: return 'ValidationReport';
      case PipelineStage.PREVIEW: return 'PreviewSnapshot';
      case PipelineStage.EXPORT: return 'ExportManifest';
      case PipelineStage.VERIFICATION: return 'VerificationReport';
      case PipelineStage.REPAIR_PLANNING: return 'RepairPlan';
      case PipelineStage.REPORT: return 'OrchestrationReport';
    }
  }
}
