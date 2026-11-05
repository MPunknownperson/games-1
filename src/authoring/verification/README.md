# PRESERVE Authoring — Verification & Repair Layer

An isolated quality-assurance layer for the Authoring System. It verifies
generated authoring code and structures automatically, then describes how to
repair what it finds.

Development-only tooling. It contains no engine imports, no gameplay knowledge,
no UI dependencies, no React/DOM/canvas/WebGL, no filesystem writes, and no
network access.

## Architecture position

```
Schema → Generator → IR → Backend → Validator → Preview → Export → Verification
```

Verification is the final stage. It consumes artifacts the earlier stages
produced — described source files, in-memory structures, and build outcome
information — and reports on their quality.

## Relationship with the Validator

The two layers answer different questions and never call each other.

| | Validator | Verification |
| --- | --- | --- |
| **Question** | "Is this data structurally well-formed?" | "Does this code meet our quality standards?" |
| **Inspects** | Schemas, IR trees, generated source text | Source files, structures, build outcomes |
| **Examples** | "Class has no name", "Duplicate schema id" | "File exceeds 250 lines", "Forbidden import" |
| **Output** | `ValidationReport` | `VerificationReport` + `RepairSuggestion[]` |
| **Stage** | Before Preview | After Export |

Validation asks whether the artifact is *correct*. Verification asks whether it
is *acceptable* — size limits, layering rules, isolation, determinism, and
build health.

## Data flow

```
Descriptors (source files / structures / build outcome)
        ↓
VerificationRunner  ──selects rules by target kind, sorted by id──▶ VerificationRegistry
        ↓
VerificationRule.verify(target, context)  →  VerificationIssue[]
        ↓
VerificationResult (per rule)
        ↓
VerificationReport  ──derives──▶  RepairSuggestion[]
```

## Files

| File | Responsibility |
| --- | --- |
| `VerificationTypes.ts` | `VerificationSeverity` (ERROR/WARNING/INFO), `VerificationCategory` (STRUCTURE/DEPENDENCY/ISOLATION/SERIALIZATION/DETERMINISM/BUILD), `VerificationTargetKind`, `VerificationStatus`, issue and descriptor shapes, target constructors. |
| `VerificationContext.ts` | Immutable context: project version, mode, configuration (limits and pattern lists), metadata. `DEFAULT_VERIFICATION_CONFIG` holds all thresholds — nothing is hardcoded in the checks. |
| `VerificationRule.ts` | The `VerificationRule<T>` contract (`id`, `name`, `description`, `category`, `targetKind`, `verify()`), plus `defineRule`, shape assertion, and ordering. |
| `VerificationResult.ts` | One rule execution: passed state, issues, warnings, info, status, timing. Partitions findings by severity. |
| `VerificationReport.ts` | Aggregate report: all checks, failed checks, repair suggestions, deterministic `toJSON()` / `serialize()` / `format()`. |
| `VerificationRegistry.ts` | Instance-based rule registration with duplicate rejection. Indexed by target kind and category. No global state. |
| `VerificationRunner.ts` | Executes rules in deterministic order and builds the report. Contains no business logic. |
| `VerificationChecks.ts` | The seven built-in checks (see below). |
| `RepairSuggestion.ts` | Describes fixes: issue, location, suggested action, risk level, automatability. |

## Built-in checks

| # | Rule id | Detects |
| --- | --- | --- |
| 1 | `structure.file-size` | Files exceeding `maxFileLines` (default 250) |
| 2 | `structure.function-size` | Function bodies exceeding `maxFunctionLines` (default 60) |
| 3 | `dependency.forbidden-imports` | Imports of react, canvas, webgl, node:fs, etc. |
| 4 | `isolation.runtime-coupling` | Imports reaching into `engine/`, `ui/`, `game/`, `App` |
| 5 | `serialization.json-safe` | Function values and circular references in structures |
| 6 | `determinism.unstable-patterns` | `Math.random()`, `Date.now()`, `performance.now()`, … |
| 7 | `build.outcome` | Build failures, compilation errors, compilation warnings |

## Usage

```ts
import { VerificationRegistry } from './VerificationRegistry';
import { VerificationRunner } from './VerificationRunner';
import { BUILT_IN_CHECKS } from './VerificationChecks';
import { sourceFileTarget, structureTarget, buildTarget } from './VerificationTypes';

const registry = new VerificationRegistry();
registry.registerAll(BUILT_IN_CHECKS);

const runner = new VerificationRunner(registry, { title: 'Authoring QA' });

const report = runner.runMany([
  sourceFileTarget({ path: 'src/authoring/foo.ts', contents: fileText }),
  structureTarget(exportManifest, 'manifest'),
  buildTarget({ success: true, moduleCount: 41, outputBytes: 320_660 }),
], {
  projectVersion: '1.0.0',
  mode: 'strict',
});

console.log(report.format());
console.log(report.isSuccessful());
console.log(report.serialize({ timestamp: '2024-01-01T00:00:00.000Z' }));
```

## Repair workflow

1. Run verification and inspect `report.getFailedResults()`.
2. Read `report.getRepairSuggestions()` — each entry carries the issue, its
   location, a concrete `suggestedAction`, a `risk` level, and whether it is
   `automatable`.
3. Apply the fixes manually. **This layer never edits files.** Suggestions are
   advice; a future tool may consume the `automatable` flag.
4. Re-run verification to confirm the findings are resolved.

```ts
for (const fix of report.getRepairSuggestions()) {
  console.log(`[${fix.risk}] ${fix.issueCode} → ${fix.suggestedAction}`);
}
```

## Extending with custom rules

Rules are independent and order-agnostic:

```ts
import { defineRule } from './VerificationRule';
import { VerificationCategory, VerificationTargetKind, createIssue } from './VerificationTypes';
import type { SourceFileDescriptor } from './VerificationTypes';

const noTodoCheck = defineRule<SourceFileDescriptor>({
  id: 'structure.no-todo',
  name: 'No TODO markers',
  description: 'Flags leftover TODO markers in committed source.',
  category: VerificationCategory.STRUCTURE,
  targetKind: VerificationTargetKind.SOURCE_FILE,
  verify: (file) =>
    file.contents.includes('TODO')
      ? [createIssue('TODO_FOUND', VerificationCategory.STRUCTURE, 'File contains a TODO marker.',
          { severity: 'WARNING', location: { file: file.path } })]
      : [],
});

registry.register(noTodoCheck);
```

A rule that throws is captured by the runner as a `VERIFICATION_RULE_THREW`
error finding, so one faulty rule can never abort an entire pass.

## Guarantees

- **Quality only** — zero knowledge of towers, enemies, weapons, damage,
  health, levels, themes, balancing, or UI.
- **Deterministic** — rules execute sorted by identifier; targets in supplied
  order; pass a timestamp for byte-stable JSON.
- **Serializable** — every issue, result, report, and suggestion is plain data.
- **No global mutable state** — each registry, runner, and report owns its data.
- **No filesystem or network access** — callers supply file *descriptors*; the
  layer never reads or writes anything.
- **Composition over inheritance** — runners hold registries; nothing subclasses.
- **Advisory repair only** — suggestions are described, never applied.
