# PRESERVE Authoring — AI-Assisted Safe Repair Layer

A safety-first, development-only workflow for analyzing problems, classifying
repair scope, planning exact local changes, applying only approved low-risk
changes to **in-memory documents**, verifying supplied quality evidence, and
producing a final report.

This is **not an autonomous coding agent** and **not an external AI API
integration**. It never reads or writes the filesystem, runs shell commands,
uses git, connects to a network, installs dependencies, changes build
configuration, or modifies runtime/game/engine/UI code.

## Workflow

```text
Detection (RepairProblem)
    ↓
Problem Classification (RepairAnalyzer + RepairScopeClassifier)
    ↓
Repair Scope Analysis (SafeRepairPolicy)
    ↓
Repair Plan Generation (RepairPlanGenerator)
    ↓
Safe In-Memory Repair (RepairExecutor; TRIVIAL/SMALL only)
    ↓
Verification (RepairVerifier; consumes outcomes from existing checks)
    ↓
Final Report (RepairReport)
```

An AI assistant must never bypass this workflow. Moderate repairs stop for
approval, and large/runtime/architecture repairs are rejected.

## Scope model

| Scope | Typical issue | Automatic behavior |
| --- | --- | --- |
| `TRIVIAL` | typo, formatting, semicolon, obvious import typo | Allowed inside approved paths |
| `SMALL` | local null guard, isolated condition, local type correction | Allowed only when ≤3 files, ≤50 lines, no API/dependency/architecture/runtime impact |
| `MODERATE` | interfaces, interacting modules, unclear intent | Proposal only; requires approval |
| `LARGE` | architecture, data models, gameplay, major refactor | Rejected; explanation only |

## Safety boundaries

Default automatic target:

```text
src/authoring/
```

Protected targets:

```text
src/engine/
src/runtime/
src/game/
src/ui/
```

The policy also rejects dependency/configuration changes, file removal,
architecture impact, runtime impact, changes outside approved paths, and plans
that exceed automatic file/line limits.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `SafeRepairTypes.ts` | Serializable scope, risk, status, operation, finding, change, decision, plan, document, and execution contracts. |
| `SafeRepairContext.ts` | Immutable project boundaries, maximum scope, verification requirements, and approval policy. |
| `RepairAnalyzer.ts` | Normalizes detected problems into conservative `RepairFinding` objects. Does not fix anything. |
| `RepairScopeClassifier.ts` | Applies policy to choose `AUTO_FIX_ALLOWED`, `REQUIRES_APPROVAL`, or `REJECTED`. |
| `RepairPlanGenerator.ts` | Combines a finding with caller-supplied exact local changes. Performs no execution. |
| `RepairExecutor.ts` | Applies exact unique replacement or insertion operations to caller-supplied strings only. No filesystem access. |
| `RepairVerifier.ts` | Verifies caller-supplied build, type-check, test, import, error, and changed-path evidence. Runs no subprocesses. |
| `RepairReport.ts` | Produces the final status, scope, changed-file/line counts, verification outcome, and human-review flag. |
| `SafeRepairPolicy.ts` | Central limits (`MAX_AUTO_FILES = 3`, `MAX_AUTO_LINES = 50`) and path/impact/operation safety rules. |

## Example

```ts
const context = createSafeRepairContext();
const finding = analyzeProblem({
  issueId: 'MISSING_NULL_GUARD',
  description: 'Missing null check',
  paths: ['src/authoring/example.ts'],
  estimatedLines: 3,
});

const classification = classifyRepairScope(finding, context);
const plan = generateRepairPlan({
  finding,
  planId: 'safe_plan_001',
  timestamp: '2026-01-01T00:00:00.000Z',
  changes: [{
    id: 'change_001',
    operation: 'ADD_GUARD',
    path: 'src/authoring/example.ts',
    description: 'Add a local null guard',
    estimatedLines: 3,
    verificationRequired: true,
    searchText: 'use(value);',
    replacementText: 'if (value == null) return;\nuse(value);',
  }],
}, context);

const execution = executeSafeRepair(plan, [
  { path: 'src/authoring/example.ts', content: 'use(value);' },
], context);

// Existing build/type/test systems supply this evidence. The safe-repair
// layer does not run commands itself.
const verification = verifyRepair(plan, execution, {
  buildSucceeded: true,
  typeCheckPassed: true,
  testsPassed: true,
  errorsBefore: 1,
  errorsAfter: 0,
  forbiddenImportsAdded: [],
  actualChangedPaths: execution.changedPaths,
  actualChangedLines: execution.changedLines,
}, context);
```

## Important limitations

- The executor is intentionally not a workspace editor. It returns updated
  in-memory document strings; an approved external environment decides whether
  and how to persist them.
- Moderate plans remain ineligible for this automatic executor even after an
  approval reference is recorded. A future reviewed executor may handle them.
- Build, type-check, and test verification is evidence-based. Existing systems
  provide outcomes because this layer cannot execute subprocesses.
- Search text must occur exactly once; ambiguous replacements fail safely.
- There is no AI model integration, autonomous loop, watcher, commit system,
  deployment, dependency updater, or external API client.