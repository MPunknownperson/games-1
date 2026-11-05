# PRESERVE Authoring — Schema & Manifest Layer

The single authoritative definition of authoring data. Every future Authoring
module depends on this layer, and this layer depends on nothing else.

Schemas **describe**. They never execute, never contain functions, never hold
gameplay behavior, and never import runtime, engine, gameplay, or UI code.

## Dependency direction

```
Schema  ->  Generator  ->  Validator  ->  Registry  ->  Preview  ->  Exporter
```

This direction is never reversed. A Generator never defines a schema; the
schema defines the Generator's input.

## Files

| File | Responsibility |
| --- | --- |
| `SchemaTypes.ts` | All shared interfaces: `SchemaDefinition`, `SchemaMetadata`, `SchemaField`, `SchemaDependency`, `SchemaCompatibility`, `SemanticVersion`, `SchemaCategory`, `SchemaStatus`, `SchemaManifestData`. |
| `SchemaVersion.ts` | Semantic versioning with no external libraries: `createVersion`, `compare`, `equals`, `compatible`, `upgrade`, `downgrade`, `parseVersion`, `formatVersion`, `isValidVersion`. |
| `SchemaMetadata.ts` | Metadata construction and inspection helpers. Pure functions; never mutate inputs. |
| `SchemaFactory.ts` | Creates empty, well-formed schemas and fields. Factory only — performs no validation. |
| `SchemaValidator.ts` | Validates **structure only**: required fields, version format, identifier and tag shape, duplicate ids, unknown/deprecated references, circular metadata dependencies. |
| `SchemaRegistry.ts` | In-memory storage with O(1) id lookup plus category and tag indexes. No filesystem access. |
| `SchemaManifest.ts` | The index of all known schemas: registration, lookup by id/category/tag/version/dependency, transitive dependency closure, and deterministic export. |

## Required schema fields

Every `SchemaDefinition` contains: `id`, `name`, `displayName`, `category`,
`version`, `author`, `description`, `tags`, `createdAt`, `updatedAt`, `status`,
plus a `metadata` payload and declarative `fields`.

## Categories

`tower`, `enemy`, `projectile`, `theme`, `decoration`, `particle`, `puzzle`,
`uiPanel`, `audio`, `localization`, `achievement`, `relic`, `card`, `quest`,
`wave`, `difficulty`.

New categories are added by extending the `SchemaCategory` union. Because every
consumer treats the category as an opaque key, adding one never requires
modifying existing schemas, the registry, the manifest, or the factory.

## Quick start

```ts
import { createSchema, createField } from './SchemaFactory';
import { SchemaManifest } from './SchemaManifest';
import { validateSchemaCollection } from './SchemaValidator';

const schema = createSchema('tower', 'archerTower', {
  displayName: 'Archer Tower',
  author: 'design-team',
  description: 'Describes an archer-style defensive structure.',
  tags: ['defensive', 'ranged'],
  fields: [
    createField('attackRange', 'number', { required: true, defaultValue: 3 }),
  ],
});

const manifest = new SchemaManifest();
manifest.register(schema);

const result = validateSchemaCollection(manifest.list());
console.log(result.valid, result.errorCount);

console.log(manifest.toJSON({ timestamp: '2024-01-01T00:00:00.000Z' }));
```

## Guarantees

- **Serializable** — every schema round-trips through JSON without loss.
- **Deterministic** — supply a `timestamp` to `createSchema` or
  `manifest.export()` for byte-stable output.
- **YAML-ready** — `manifest.toPlainObject()` returns a plain nested object for
  a future YAML exporter; no YAML dependency is introduced here.
- **O(1) lookup** — by id, category, and tag.
- **Linear validation** — cost scales with schemas plus declared dependencies.
- **No global mutable state** — every registry and manifest owns its storage.
- **AI-friendly** — descriptive names, no abbreviations, documentation on every
  exported interface, nesting kept to three levels or fewer.

## Out of scope

This layer contains no Generators, Blueprints, Templates, Preview, Export
implementations, gameplay validation, visual editors, or runtime integration.
