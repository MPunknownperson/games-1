# PRESERVE Authoring — Validation System

Validates authoring data **before** it becomes generation output. The validator
detects *structural* problems only — it has no knowledge of game logic.

| Allowed | Not allowed |
| --- | --- |
| `"Class has no name"` | `"Tower damage is too low"` |
| `"Unmatched closing bracket"` | `"Enemy health is unbalanced"` |
| `"Schema version is malformed"` | `"Theme colors clash"` |

Development-only. Nothing in the engine, gameplay, UI, rendering, or runtime
imports this module, so it is fully tree-shaken from production bundles.

## Architecture

```
Input Data (Schema / IR / Generated Source)
                  |
                  v
          ValidationRunner
                  |
                  v
        Registered Validators
                  |
                  v
          ValidationReport
```

## Dependency direction

```
Schema  ->  IR  ->  Validator  ->  Report
```

Never reversed. The validator imports only from `../schema/` (to reuse the
existing schema checks) and from within its own folder. It never imports the
engine, gameplay, UI, or rendering.

## Files

| File | Responsibility |
| --- | --- |
| `ValidatorTypes.ts` | Shared vocabulary: `ValidationSeverity` (`ERROR`/`WARNING`/`INFO`), `ValidationLocation`, `ValidationIssue`, `ValidationTarget`, plus tiny constructors. No logic. |
| `ValidationRule.ts` | The `ValidationRule<T>` contract (`id`, `name`, `description`, `validate()`) and the `Validator<T>` grouping contract. Rules are independent and never call each other. |
| `ValidationContext.ts` | Read-only pass context: mode, strict flag, version info, metadata. Holds no engine/gameplay/UI reference. |
| `ValidationResult.ts` | Outcome of one validator: `passed`, `issues`, `executionTime`, `validatorName`, plus severity counts. JSON-serializable. |
| `ValidationReport.ts` | Combined report with `toJSON()` and `serialize()`. Deterministic output; accepts a fixed timestamp for byte-stable JSON. |
| `ValidatorRegistry.ts` | `register()`, `unregister()`, `get()`, `list()`. Rejects duplicate IDs. Instance-scoped — no global mutable state. |
| `ValidationRunner.ts` | Coordinator: `runAll()` and `runOne()`. Selects validators by target kind, executes rules, collects results. Contains no rules itself. |
| `IRValidator.ts` | Structural checks on IR: missing `kind`, missing declaration names, missing `fileId`, malformed containers/blocks, invalid parameters, invalid type references. |
| `SchemaValidatorAdapter.ts` | Bridges the existing Schema layer validator into this system. Delegates to `validateSchema` / `validateSchemaCollection` rather than duplicating them. |
| `SourceValidator.ts` | Lightweight source-text checks: empty output, unmatched brackets, malformed imports, missing exports, obvious syntax defects. Not a compiler or parser. |

## Quick start

```ts
import { ValidatorRegistry } from './ValidatorRegistry';
import { ValidationRunner } from './ValidationRunner';
import { irValidator } from './IRValidator';
import { schemaValidatorAdapter } from './SchemaValidatorAdapter';
import { sourceValidator } from './SourceValidator';
import { irTarget, sourceTarget } from './ValidatorTypes';

const registry = new ValidatorRegistry();
registry.register(irValidator);
registry.register(schemaValidatorAdapter);
registry.register(sourceValidator);

const runner = new ValidationRunner(registry);

// Invalid IR — a class with no name
const report = runner.runAll(irTarget({ kind: 'Class', members: [] }));
console.log(report.isSuccessful());        // false
console.log(report.format());
// [FAIL] ir-validator (0.12ms)
//     ERROR IR_DECLARATION_MISSING_NAME [root]: Class node has no name.
//        hint: Provide a non-empty `name` for the Class node.

// Valid IR
runner.runAll(irTarget({ kind: 'Class', name: 'Example', members: [] }))
  .isSuccessful();                          // true

// Generated source
runner.runAll(sourceTarget({ path: 'Example.ts', contents: 'export class Example {\n}\n' }))
  .isSuccessful();                          // true

// Deterministic JSON
console.log(report.serialize({ timestamp: '2024-01-01T00:00:00.000Z' }));
```

## Strict mode

Passing `{ strict: true }` to `runAll` / `runOne` promotes every `WARNING` to an
`ERROR`, so advisory findings become blocking:

```ts
runner.runAll(target, { strict: true, mode: 'exhaustive' });
```

## Writing a rule

Rules are independent, pure, and order-agnostic:

```ts
import { defineRule, defineValidator } from './ValidationRule';
import { ValidationTargetKind, createIssue } from './ValidatorTypes';

const rule = defineRule<{ name?: string }>({
  id: 'example.name.required',
  name: 'Name required',
  description: 'The node must declare a non-empty name.',
  validate: (target) =>
    target.name
      ? []
      : [createIssue('EXAMPLE_MISSING_NAME', 'Node has no name.', {
          suggestion: 'Provide a `name`.',
        })],
});

export const exampleValidator = defineValidator({
  id: 'example-validator',
  name: 'Example Validator',
  targetKind: ValidationTargetKind.IR,
  rules: [rule],
});
```

A rule that throws is captured by the runner as an `ERROR` issue
(`VALIDATOR_RULE_THREW`), so one faulty rule can never abort a whole pass.

## Guarantees

- **Structure only** — zero knowledge of towers, enemies, weapons, damage,
  health, levels, themes, balancing, game rules, or UI.
- **Deterministic** — results are emitted in validator registration order and
  rule declaration order; supply a timestamp for byte-stable JSON.
- **Serializable** — every result and report is plain data with no functions.
- **No global mutable state** — each registry, runner, and report owns its data.
- **No filesystem or network access** — everything operates on in-memory values.
- **Composition over inheritance** — validators hold rules; nothing subclasses.
- **AI-friendly** — every file under 250 lines, every function under 60 lines,
  every exported interface documented.

## Out of scope

No generators, editors, previews, content tools, or gameplay validation. This
layer only inspects the structure of schemas, IR, and generated source.
