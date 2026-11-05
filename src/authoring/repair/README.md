# PRESERVE Authoring — Repair Planning Layer

An isolated quality assurance and safety validation system for the Authoring
System. It converts upstream verification findings into **safe, deterministic
repair plans**.

This is **ONLY** a repair planning and safety validation system. It does **NOT**
implement automatic code modification, does **NOT** create a Repair Executor,
and never edits existing source files.

It contains no engine imports, no gameplay knowledge, no UI dependencies,
no React/DOM/canvas/WebGL, no filesystem writes, and no network access.

## Architecture position

```
Schema → Generator → IR → Backend → Validator → Preview → Export → Verification
                                                                         ↓
                                                                  Repair Planner
                                                                         ↓
                                                                 Safe Repair Plan
                                                                         ↓
                                                                  Repair Validator
                                                                         ↓
                                                          Future Repair Executor (NOT implemented)
```

## Why execution is intentionally excluded

1. **Safety Separation** — Formulating what should change is a diagnostic and
   architectural concern. Applying changes to disk or source trees is an I/O and
   version-control concern.
2. **Human Approval Gates** — Invasive or high-risk modifications (such as
   breaking circular references or removing imports) require explicit review
   before any file is touched.
3. **Pure Functional Validation** — Keeping planning pure and side-effect free
   allows repair plans to be validated, serialized, diffed, and tested in
   memory without mutating workspace state or requiring git rollbacks.

## Relationship with Verification Layer

The Verification layer inspects code and structures to produce a
`VerificationReport` with issues and advisory `RepairSuggestion` items.

The Repair Planning layer consumes those findings and translates them into a
formal `RepairPlan` consisting of concrete `RepairAction` descriptions. While a
suggestion is advisory text ("Extract cohesive blocks"), a planned action is a
structured directive (`type: EDIT_FILE`, `target: ...`, `risk: MEDIUM`,
`confidence: 0.9`) that is evaluated against strict safety policy.

## Data flow & repair planning workflow

1. **Input** — A `VerificationReport`, `VerificationResult`, or issue array.
2. **RepairPlanner** — Matches verification findings to structured actions and
   assembles a `RepairPlan`.
3. **RepairPolicy** — Evaluates each action against safety boundaries (e.g.
   blocking modifications to protected runtime paths).
4. **RepairResult** — Wraps the plan with status (`PLANNED`, `BLOCKED`, etc.),
   error/warning lists, and a derived `requiresHumanApproval` flag.
5. **RepairValidator** — Performs structural and safety validation on the plan
   prior to hand-off to a future executor.

## Safety model

The safety policy enforces strict boundaries:

- **Allowed Paths** — Modifications are permitted only within designated authoring
  tooling directories (default: `src/authoring/*`).
- **Protected Paths** — Any attempt to modify runtime, engine, gameplay, or UI
  code (`src/engine/*`, `src/runtime/*`, `src/game/*`, `src/ui/*`, configuration
  or dependency files) is immediately **BLOCKED**.
- **Risk Ceilings** — In `safe` mode, actions rated `HIGH` or `CRITICAL` risk are
  rejected. In `standard` mode, `CRITICAL` actions are rejected or require
  mandatory human approval.
- **Action Restrictions** — Package dependency changes (`DEPENDENCY_CHANGE`) and
  file deletions (`REMOVE_FILE`) are forbidden by default.

## Future Repair Executor design

A future `RepairExecutor` module (not implemented in this phase) will:

1. Accept a `RepairPlan` that has passed `RepairValidator`.
2. Verify that `requiresHumanApproval` is satisfied if flagged.
3. Perform atomic, transactional file modifications using an isolated filesystem
   driver or workspace git integration.
4. Re-run the Verification layer on modified files to verify the fix succeeded
   without introducing regressions.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `RepairTypes.ts` | Shared contracts: `RepairRisk`, `RepairActionType`, `RepairStatus`, `RepairTarget`, `RepairIssueReference`, plus risk ordering helpers. JSON-serializable. |
| `RepairContext.ts` | Immutable context: toolchain/project versions, repair mode (`safe` / `standard` / `aggressive`), allowed/protected path lists, metadata. |
| `RepairAction.ts` | Single action description: `id`, `type`, `target`, `description`, `reason`, `risk`, `confidence`, `requiresVerification`, issue link. No execution logic. |
| `RepairPlan.ts` | Container holding actions and issue references. Deterministic ordering, risk summary aggregation, and JSON serialization. |
| `RepairPolicy.ts` | Safety evaluation engine. Enforces allowed/protected path boundaries, risk ceilings, and forbidden action types. |
| `RepairPlanner.ts` | Core planning engine. Maps verification findings to structured repair actions and evaluates them against safety policy. |
| `RepairResult.ts` | Planning outcome: `success`, `status`, `plan`, `warnings`, `errors`, `requiresHumanApproval`. |
| `RepairValidator.ts` | Structural and safety validation of a `RepairPlan`. Checks completeness, action valid types, and policy compliance. |
| `README.md` | Documentation of architecture, safety model, workflow, and future executor design. |

## Quick start

```ts
import { RepairPlanner } from './RepairPlanner';
import { validateRepairPlan, formatRepairValidation } from './RepairValidator';
import { createRepairContext } from './RepairContext';

// 1. Initialize planner with default safety policy
const planner = new RepairPlanner();

// 2. Create context with custom safety boundaries if needed
const context = createRepairContext({
  repairMode: 'standard',
  allowedPaths: ['src/authoring/*'],
  protectedPaths: ['src/engine/*', 'src/runtime/*'],
});

// 3. Plan repairs from an upstream verification report
const result = planner.planRepairs(verificationReport, context);

console.log(result.success);               // true if all actions are allowed
console.log(result.status);                // PLANNED or BLOCKED
console.log(result.requiresHumanApproval); // true if high risk actions exist

// 4. Validate the resulting plan structurally and against safety rules
if (result.plan) {
  const check = validateRepairPlan(result.plan, context);
  console.log(formatRepairValidation(check));
  console.log(result.plan.serialize());    // deterministic JSON output
}
```

## Guarantees

- **Planning only** — zero file editing, zero code execution, zero filesystem/network I/O.
- **Safety first** — strict path protection preventing runtime/engine/gameplay coupling or corruption.
- **Deterministic** — actions sort by risk and target path; JSON output is byte-stable.
- **Serializable** — all plans, actions, results, and issues are plain JSON data.
- **No global mutable state** — every planner, plan, policy, and validator instance owns its state.
- **Composition over inheritance** — planners hold policies; plans hold actions; nothing subclasses.
- **AI-friendly** — small files (<250 lines), small functions (<60 lines), documented interfaces.
