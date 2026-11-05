# PRESERVE Authoring — Generation Pipeline Core

Coordination-only. This pipeline never knows *what* is being generated — it
only accepts requests, resolves the right backend, invokes it, collects
output, and returns a structured result. No gameplay, no towers, no enemies,
no themes; no filesystem, no runtime, no engine, no UI.

## Dependency direction

```
Schema
  |
  v
Generation Request
  |
  v
Generation Pipeline
  |
  v
Language Backend        (interface only in this phase)
  |
  v
Writer
  |
  v
Output (GenerationResult)
```

This direction is never reversed. The generator depends on the Schema layer
for the `SemanticVersion` type; the Schema layer does not depend on the
generator. Nothing here imports the runtime, engine, React, or UI.

## Files

| File | Responsibility |
| --- | --- |
| `GenerationTarget.ts` | Descriptor of the output destination. Only `memory` is implemented in this phase; `virtual`, `filesystem`, `network`, and `cloud` are declared for future use. |
| `GenerationRequest.ts` | One serializable generation job (id, schemaId/version, target language, target directory, target descriptor, build mode, overwrite policy, generation mode, metadata) plus factory and shape validator. |
| `GenerationResult.ts` | Serializable outcome: outcome tag, warnings, errors, generated files, execution time, statistics, metadata. |
| `GenerationWriter.ts` | Collects `text`, `json`, `yaml` (JSON preview + warning), and `binary` (base64) artifacts in memory. Never touches the filesystem. |
| `GenerationEvents.ts` | Independent typed event bus. Emits `started`, `progress`, `completed`, `failed`, `cancelled`. |
| `GenerationLogger.ts` | Independent, timestamped logger with `info` / `warning` / `error` / `debug` and category-scoped `time()` helpers. |
| `GenerationSession.ts` | Per-job lifecycle tracker: request, timing, progress, status, and a cooperative cancellation token. |
| `GenerationBackend.ts` | Interface every language backend implements. Includes shape assertion and a registration record. |
| `GenerationContext.ts` | Immutable runtime bundle handed to a backend: session, backend, logger, config, cancellation, progress reporter. |
| `GenerationPipeline.ts` | Central coordinator: register / list / lookup backends, `initialize()`, `shutdown()`, `dispatch(request)`. |

## Quick start

```ts
import { GenerationPipeline } from './GenerationPipeline';
import { createRequest } from './GenerationRequest';
import type { GenerationBackend } from './GenerationBackend';

const pipeline = new GenerationPipeline();

// A backend must implement the six required methods.
const backend: GenerationBackend = {
  getName: () => 'example',
  getVersion: () => '1.0.0',
  initialize: () => {},
  shutdown: () => {},
  supports: (req) => req.targetLanguage === 'text',
  generate: (req, writer) => {
    writer.writeText(`${req.targetDirectory}/notes.txt`, `Schema: ${req.schemaId}`);
  },
};

pipeline.registerBackend(backend);

const request = createRequest({
  schemaId: 'demo.example',
  schemaVersion: { major: 1, minor: 0, patch: 0 },
  targetLanguage: 'text',
  timestamp: '2024-01-01T00:00:00.000Z',
});

const result = await pipeline.dispatch(request);
console.log(result.success, result.statistics.fileCount);
```

## Backend selection

`dispatch()` selects a backend in this order:

1. If `request.metadata.backend` names a registered backend, use it.
2. Otherwise the first backend whose `supports(request)` returns `true`.
3. Otherwise a failure result with a clear error message.

## Guarantees

- **Coordination only** — no gameplay knowledge, no schema interpretation.
- **Serializable** — requests and results round-trip through JSON without loss.
- **Deterministic** — supply `requestId` and `timestamp` for byte-stable output.
- **Cooperative cancellation** — backends check `context.cancellation` or call
  `throwIfCancelled()`; the pipeline translates cancellation into the correct
  outcome without losing already-generated artifacts.
- **No global mutable state** — every pipeline, session, writer, logger, and
  event bus owns its own state.
- **AI-friendly** — small files (each well under 250 lines), documented
  interfaces, descriptive names, no abbreviations.

## Out of scope

This phase implements only the coordinator and its collaborators. It does not
include any language backend (TypeScript, JSON, YAML, Lua, Markdown), any
gameplay generator, any filesystem writer, any preview module, or any runtime
integration.
