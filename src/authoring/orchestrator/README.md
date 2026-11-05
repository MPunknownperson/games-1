# PRESERVE Authoring — AI Orchestration Layer

A safe orchestration and workflow coordination layer for the PRESERVE Authoring System. It coordinates authoring tasks across architectural pipeline stages:

```
Schema → Generator → IR → Backend → Validator → Preview → Export → Verification → Repair Planning → Report
```

This is **NOT** an autonomous coding agent. It does **NOT** modify files automatically, does **NOT** execute repairs, and contains **NO** runtime game code. It acts strictly as a workflow planner and execution coordinator.

---

## Architecture Position & Why This is Not an Autonomous Agent

An autonomous coding agent edits source files on disk, runs terminal commands, mutates git working trees, and makes unsupervised changes to project code.

The PRESERVE AI Orchestration Layer is intentionally constrained:
1. **No Autonomous File Editing**: This layer produces structured, in-memory execution plans and reports. It never touches the filesystem, git, network, or subprocess execution.
2. **No Direct Execution of Repairs**: While it can coordinate the `REPAIR_PLANNING` stage to produce a `RepairPlan`, applying those repairs is explicitly gated and left to external human approval and future transactional executors.
3. **Pure Workflow Coordination**: The `PipelinePlanner` and `PipelineRunner` know nothing about towers, enemies, damage, health, levels, themes, or balancing. They only coordinate tasks, dependencies, and execution order.
4. **Complete Runtime Isolation**: Nothing in the engine, gameplay, UI, rendering, or runtime imports this module, ensuring it is fully tree-shaken and excluded from shipping game builds.

---

## Data Flow

```
User / AI Agent Intent
          │
          ▼
      AIRequest (intent, target, constraints, requestedOutput)
          │
          ▼
   PipelinePlanner ───resolves stages & wires dependencies───┐
          │                                                  │
          ▼                                                  ▼
     PipelinePlan (deterministic topological task order)     │
          │                                                  │
          ▼                                                  ▼
   PipelineRunner ───injects stage handlers from───► StageRegistry
          │
          ▼
OrchestrationResult (completedStages, failedStages, errors, serializedOutput)
```

1. **Request Formulation**: A caller (user tool or external AI model) creates an `AIRequest` describing an authoring intent (e.g., `"Create new enemy asset"`).
2. **Plan Generation**: The `PipelinePlanner` inspects the request intent and requested output format to infer required pipeline stages. It filters stages through the `AIOrchestratorContext` and wires sequential task dependencies following the canonical architectural order.
3. **Handler Lookup & Execution**: The `PipelineRunner` validates the plan's dependency network (detecting cycles or stage order reversals), then topologically sorts and executes tasks using handlers injected from the `StageRegistry`.
4. **Result Synthesis**: The runner collects outputs from each executed stage into an immutable, JSON-serializable `OrchestrationResult`.

---

## Relationship with Validator, Verification, and Repair Planner

The Orchestration Layer sits above individual authoring subsystems as a unifying coordinator:
- **Validator (`VALIDATOR` Stage)**: Evaluates structural correctness of schemas, IR trees, and generated source code. The orchestrator invokes validation after generation or translation stages to catch structural defects early.
- **Verification (`VERIFICATION` Stage)**: Evaluates quality standards, size limits, layering rules, and build outcomes. The orchestrator schedules verification as a diagnostic audit step after export or preview assembly.
- **Repair Planner (`REPAIR_PLANNING` Stage)**: Converts verification findings into safe, declarative repair action plans. The orchestrator can trigger repair planning when verification reports defects, but it **never executes** the resulting plan.

---

## Future Integration Possibilities with External AI Models

Because all data structures (`AIRequest`, `PipelinePlan`, `PipelineTask`, `OrchestrationResult`) are deterministic and JSON-serializable, this layer provides a clean integration boundary for external Large Language Models (LLMs) or AI assistants:
1. **Structured Prompting**: External AI models can submit JSON-formatted `AIRequest` objects instead of generating raw code strings.
2. **Plan Inspection & Human-in-the-Loop**: An AI assistant can generate a `PipelinePlan` via `PipelinePlanner.createPlan()` and present it to a human developer for review before invoking `PipelineRunner.runPlan()`.
3. **Capability Handshake**: External AI agents can declare their available capabilities using `AgentCapability` (e.g., `SCHEMA_AUTHORING`, `CODE_GENERATION`, `REPAIR_RECOMMENDATION`) during session initiation in `WorkflowMetadata`.
4. **Deterministic Feedback Loop**: When stage execution fails or verification reports defects, the `OrchestrationResult` provides structured errors and warnings that can be fed back into an LLM prompt for self-correction without risking workspace corruption.

---

## File Responsibilities

| File | Lines | Description |
| :--- | :--- | :--- |
| **`AIOrchestratorTypes.ts`** | 142 | Shared contracts: `PipelineStage`, `TaskType`, `ExecutionStatus`, `ExecutionMode`, `AgentCapability`, `WorkflowMetadata`, stage ordering utilities. |
| **`AIOrchestratorContext.ts`** | 121 | Immutable execution context holding project version, requested operation, enabled stages, operational configuration, and metadata. |
| **`PipelineTask.ts`** | 156 | Represents a single operation (`id`, `stage`, `taskType`, `inputReference`, `expectedOutput`, `status`, `dependencies`, metadata). |
| **`PipelinePlan.ts`** | 237 | Deterministic execution plan with task management, dependency validation (cycle detection and architectural ordering checks), and topological sorting. |
| **`PipelinePlanner.ts`** | 230 | Planning engine that converts `AIRequest` intents into coordinated, ordered `PipelinePlan` objects without executing tasks. |
| **`StageRegistry.ts`** | 138 | Instance-based registry for `StageHandler` implementations. Connects coordinators to execution handlers without global mutable state. |
| **`OrchestrationResult.ts`** | 164 | Immutable workflow outcome container (`success`, `completedStages`, `failedStages`, `warnings`, `errors`, `stageResults`, `serializedOutput`). |
| **`PipelineRunner.ts`** | 173 | Coordinates task execution in topological order using dependency injection from `StageRegistry`, supporting dry-run and stop-on-failure modes. |
| **`AIRequest.ts`** | 106 | User/agent request description (`requestId`, `intent`, `target`, `constraints`, `requestedOutput`, `requiredStages`). |
| **`README.md`** | — | Architecture documentation, data flow, safety model, and external AI model integration guidelines. |

---

## Usage Example

```ts
import {
  createAIRequest,
  createAIOrchestratorContext,
  PipelinePlanner,
  PipelineRunner,
  StageRegistry,
  PipelineStage,
  type StageHandler,
} from './src/authoring/orchestrator';

// 1. Initialize an instance-based StageRegistry
const registry = new StageRegistry();

// 2. Register stage execution handlers (dependency injection)
const schemaHandler: StageHandler = {
  stage: PipelineStage.SCHEMA,
  name: 'mock_schema_handler',
  version: '1.0.0',
  execute: (task, context, priorResults) => ({ schemaId: task.inputReference.locator }),
};
registry.register(schemaHandler);

// 3. Create an AIRequest describing the intent
const request = createAIRequest({
  intent: 'Create new enemy asset',
  target: 'enemy.slime',
  requestedOutput: 'report',
});

// 4. Formulate a PipelinePlan using PipelinePlanner
const planner = new PipelinePlanner();
const context = createAIOrchestratorContext({ requestedOperation: request.intent });
const plan = planner.createPlan(request, context);

console.log(plan.listTasks().length); // Tasks planned in architectural stage order
console.log(plan.validateDependencies().valid); // true

// 5. Execute the plan using PipelineRunner
const runner = new PipelineRunner(registry);
const result = await runner.runPlan(plan, context);

console.log(result.success);
console.log(result.completedStages);
console.log(result.serializedOutput);
```
