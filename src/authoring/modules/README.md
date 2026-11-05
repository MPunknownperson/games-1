# PRESERVE Authoring — Modules

This directory hosts **independent authoring modules**. It is currently empty by
design: the current scope delivers only the foundation. Content generators,
registries, validators, previews, templates, blueprints, and exporters will be
added here in future work — each as its own module.

## What an authoring module is

Every future authoring feature is an independent, composable unit that
implements the shared `AuthoringModule` interface:

```ts
interface AuthoringModule {
  getName(): string;                                   // unique, stable id
  getVersion(): string;                                // semantic version
  initialize(context: ReadonlyAuthoringContext): void | Promise<void>;
  shutdown(): void | Promise<void>;
}
```

Modules are registered with, initialized by, and shut down by the
`AuthoringSystem` coordinator:

```ts
import { createAuthoringSystem } from '../index';

const system = createAuthoringSystem({ engineVersion: '1.0.0' });
if (system) {
  system.registerModule(myModule);
  await system.initialize();
  // ...later...
  await system.shutdown();
}
```

During `initialize`, a module receives a **read-only** view of the shared
context (project root, engine version, build mode, debug flag, language, theme,
and module lookups). Modules coordinate through the event bus, log through the
logger, and record file metadata through the file registry — all obtained from
the coordinator, never through global state.

## Rules for modules

- **Composition over inheritance.** Do not subclass other modules; hold
  references to collaborators instead.
- **Small files, small units.** Keep classes under 250 lines and functions under
  60 lines.
- **Code-first.** No visual scripting, node graphs, docking layouts, Unity-style
  inspectors, or scene editors. TypeScript source remains the single source of
  truth.
- **No filesystem side effects in the foundation.** The `FileRegistry` stores
  metadata only; it never scans or mutates files.
- **Document every public interface.**

## Dependency direction (must never be violated)

```
Authoring  ──may depend on──▶  Engine
Engine      ──never──▶  Authoring
Gameplay    ──never──▶  Authoring
Runtime     ──never──▶  Authoring
```

Because nothing in the shipping application imports the authoring module,
tree-shaking removes it entirely from production bundles. The
`createAuthoringSystem` factory adds a second safeguard by returning `undefined`
under a production build.

## Not in scope yet

This foundation intentionally excludes: generators, validators, previews,
templates, and hot reload. Those arrive in later prompts.
