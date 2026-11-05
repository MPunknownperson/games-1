# PRESERVE Authoring — Testing Infrastructure

A lightweight, **development-only** validation layer that lets every future
Authoring module verify its own behavior before integration.

This is **not** a gameplay test system, **not** an end-to-end framework, and
**not** a replacement for Vitest or Jest. It is a tiny internal harness kept
completely isolated from the runtime game — nothing in the engine, gameplay,
UI, or runtime imports these files, so they are excluded from production
bundles.

## Files

| File | Responsibility |
| --- | --- |
| `AuthoringTest.ts` | The `AuthoringTest` contract (name, description, expected, `execute`), the `defineTest` factory, and the `TestSkipSignal`. |
| `AuthoringAssertions.ts` | `assert`, `assertEqual`, `assertNotEqual`, `assertDefined`, `assertUndefined`, `assertTrue`, `assertFalse`, `assertArrayLength`, `assertThrows` — all throw `AssertionFailure` with readable messages. |
| `AuthoringTestRunner.ts` | Runs many tests or one by name; measures time; supports `stopOnFailure` or continue-on-failure; returns a `TestReport`. |
| `TestReport.ts` | Structured, JSON-serializable report: passed / failed / skipped / warnings / timing / summary. |
| `MockContext.ts` | A fake `ReadonlyAuthoringContext` that never touches the real project. Simulates debug, theme, language, build mode, project root, and module lookups. |
| `MockRegistry.ts` | A generic fake registry simulating registration, lookup, duplicate detection (throws), and removal. |
| `AuthoringSelfTest.ts` | A built-in suite that validates the authoring foundation itself. |

## Quick start

```ts
import { defineTest, AuthoringTestRunner } from 'src/authoring/testing';
import { assertEqual } from 'src/authoring/testing/AuthoringAssertions';

const runner = new AuthoringTestRunner({ title: 'My Module Tests' });
runner.add(
  defineTest({
    name: 'adds two numbers',
    expected: '2 + 2 = 4',
    execute: () => assertEqual(2 + 2, 4),
  }),
);

const report = await runner.runAll();
report.print();              // human-readable summary
console.log(report.serialize()); // JSON
```

Run the built-in foundation suite:

```ts
import { runAuthoringSelfTest } from 'src/authoring/testing/AuthoringSelfTest';
const report = await runAuthoringSelfTest();
report.print();
```

## Behaviors covered by the self-test

The suite verifies: module **initialization**, **duplicate registration**,
module **shutdown**, **configuration loading**, **context mutation**,
**logger output**, and **registry operations** — plus a small performance
budget check.

## Design guarantees

- Extremely small, independent components; no unnecessary abstractions.
- Composition over inheritance; no global mutable state.
- No file scanning, no compilation, no Vite, no gameplay, no asset loading.
- Deterministic and AI-friendly APIs; stable public surface.
- Every file stays under 250 lines and every public function is documented.
