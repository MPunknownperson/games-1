# PRESERVE Authoring — TypeScript Backend

The first language backend for the PRESERVE Authoring System. It translates
language-agnostic Intermediate Representation (IR) structures into valid,
deterministic TypeScript source code.

This backend is strictly a translator. It does not understand gameplay
concepts, towers, enemies, themes, UI, or runtime systems. It never reads or
writes directly to the filesystem and never imports runtime code.

## Architecture

```
Intermediate Representation (IR)
              ↓
      TypeScript Backend
              ↓
    TypeScript Source Text
              ↓
      Generation Writer
```

## Dependency Direction

```
IR  →  TypeScript Backend  →  Writer
```

This direction is never reversed. The backend depends on the IR layer and
writes output through the `GenerationWriter` supplied by the pipeline.

## File Responsibilities

| File | Responsibility |
| --- | --- |
| `TypeScriptBackend.ts` | Implements `GenerationBackend`. Registers with `GenerationPipeline`, accepts IR input from request metadata, and coordinates generation without touching the filesystem. |
| `TypeScriptVisitor.ts` | Traverses IR nodes (`IRFile`, `IRModule`, `IRNamespace`, `IRClass`, `IRInterface`, `IREnum`, `IRFunction`, `IRMethod`, `IRProperty`, `IRVariable`, `IRImport`, `IRExport`, `IRExpression`, `IRComment`) and converts them into emission instructions. |
| `TypeScriptEmitter.ts` | Builds source output from emission instructions (classes, interfaces, enums, functions, variables, comments, spacing). Never parses IR directly. |
| `TypeScriptFormatter.ts` | Handles indentation, line breaks, spacing, braces, and formatting consistency without changing semantic meaning. |
| `TypeScriptTypeMapper.ts` | Maps IR type descriptors to TypeScript types (primitives, arrays, generics, optionals, custom references). No gameplay-specific types. |
| `ImportResolver.ts` | Collects imports, removes duplicates, sorts deterministically (by module specifier, then symbol name), and generates formatted import blocks. |
| `TypeScriptBackendConfig.ts` | Configurable options: indent size, quote style (`single` vs `double`), semicolon usage (`always` vs `never`), newline style (`lf` vs `crlf`), and target version. No hardcoded formatting rules. |

## Quick Start

```ts
import { GenerationPipeline } from '../../generator/GenerationPipeline';
import { createRequest } from '../../generator/GenerationRequest';
import { TypeScriptBackend } from './TypeScriptBackend';
import type { ClassDescriptor } from '../../ir/IRDeclaration';

const pipeline = new GenerationPipeline();
const tsBackend = new TypeScriptBackend({
  indentSize: 2,
  quoteStyle: 'single',
  semicolonStyle: 'always',
});

pipeline.registerBackend(tsBackend);

// Define an IR class descriptor
const classIr: ClassDescriptor = {
  kind: 'Class',
  name: 'Example',
  members: [],
};

const request = createRequest({
  schemaId: 'example.class',
  schemaVersion: { major: 1, minor: 0, patch: 0 },
  targetLanguage: 'typescript',
  metadata: {
    ir: classIr,
    filename: 'Example.ts',
  },
});

const result = await pipeline.dispatch(request);
console.log(result.success);
console.log(result.generatedFiles[0].contents);
// Output:
// export class Example {
//
// }
```

## Guarantees

- **Language Translator Only** — converts abstract IR into TypeScript syntax.
- **No Gameplay Knowledge** — contains zero references to towers, enemies, themes, stats, or balance.
- **No Filesystem Access** — all output is routed through `GenerationWriter` in memory.
- **No Runtime / Engine / UI Dependencies** — completely isolated from shipping game bundles.
- **Deterministic** — identical IR and configuration produce identical, byte-stable TypeScript source code.
- **AI-Friendly** — small files (<250 lines), concise functions (<60 lines), composition over inheritance, stable public APIs.
