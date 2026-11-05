# PRESERVE Authoring — Intermediate Representation Layer

The canonical representation between schema descriptions and language-specific
code generation. It contains purely semantic, language-agnostic, deterministic
descriptions — no TypeScript, Lua, JSON syntax emission, no gameplay concepts,
and no runtime dependencies.

Every future generator produces IR; every backend consumes it through
`IRVisitor`.

## Design rules

- IR contains only semantic information — descriptions, relationships,
  categories, documentation — never syntax, formatting, indentation, or
  whitespace.
- Every node has a deterministic `id`; nodes are immutable descriptions.
- No gameplay concepts: no towers, enemies, themes, waves, damage values,
  balance parameters, or rendering instructions.
- Fully JSON-serializable (`IRSerializer`).
- No runtime, engine, gameplay, or UI dependencies exist anywhere.

## Dependency direction

```
Schema
  |
  v
Generation Pipeline  ->  IR  ->  Language Backend  ->  Writer  ->  Output
```

This direction is never reversed. The schema defines the generator; the
generator produces IR; the backend traverses IR; the writer produces output.

## File responsibilities

| File | What it defines |
| --- | --- |
| `IRNode` | `IRNodeKind`, `IRIdentity`, `IRNode` base interface |
| `IRTypes` | `SchemaCategory`, `AccessModifier`, `DeclarationKindDescriptor`, `PrimitiveTypeName` |
| `IRLiteral` | Literal descriptors: `LiteralDescriptor`, factory helpers |
| `IRExpression` | Expression descriptors: function calls, variables, binary/unary operators, property access, type casts |
| `IRDeclaration` | Declarations: modules, namespaces, imports, exports, classes, interfaces, enums, variables, constants, properties, methods, comments, annotations, blocks |
| `IRModule` | `ModuleDescriptor`, `ImportDescriptor`, `ExportDescriptor` |
| `IRFile` | `FileDescriptor` |
| `IRNamespace` | `NamespaceDescriptor` |
| `IRVisitor` | `IRVisitor` interface, `visitNode()` traversal helper |
| `IRSerializer` | `SerializationOptions`, `serializeToJson()`, `serializeSchema()`, `serializeSchemaCollection()` |

## Quick start

```ts
import { ModuleDescriptor } from './IRModule';
import { serializeToJson } from './IRSerializer';

const moduleDesc: ModuleDescriptor = {
  kind: 'Module',
  name: 'example',
  displayName: 'Example Module',
  documentation: 'A demonstration of a language-agnostic module.',
  tags: ['demo'],
};

console.log(serializeToJson(moduleDesc, { pretty: true }));
```

## Visitor usage

Future language backends traverse IR through the `IRVisitor` interface:

```ts
class ExampleBackendVisitor implements IRVisitor {
  visit(node: IRNode): void { console.log('node', node.id, node.kind); }
  visitModule?(descriptor: ModuleDescriptor): void { }
  visitDeclaration?(descriptor: DeclarationDescriptor): void { }
  visitExpression?(descriptor: ExpressionDescriptor): void { }
}
```

## Validation guarantees

- Every exported interface is fully documented.
- All objects are deterministic and JSON-serializable.
- No syntax emission rules exist.
- No gameplay concepts exist.
- No runtime, engine, gameplay, or UI dependencies.
- File lengths stay well under 250 lines; no function exceeds 60 lines.
- Composition over inheritance; no global mutable state.
