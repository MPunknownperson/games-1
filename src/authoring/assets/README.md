# PRESERVE Authoring — Asset Definition & Content Authoring Foundation

A structured, deterministic, JSON-serializable model of game content
definitions. Future authoring systems can read it, check it, and store it.

This layer **describes** content. It contains no gameplay logic, no balance
judgments, and no generation. It is a foundation, not Phase 3 AI content
authoring.

## Architecture

```
AI/User Intent
        |
        v
Asset Definition Layer     (this folder: definitions, schemas, registry)
        |
        v
Asset Validation           (AssetValidator: structural checks only)
        |
        v
Content IR Layer (future)
        |
        v
Generator Layer (existing/future)
```

## Files

| File | Responsibility |
| --- | --- |
| `AssetTypes.ts` | Shared JSON-safe types: `AssetCategory`, `AssetStatus`, `AuthoringSource`, `AssetMetadata`, `ValidationIssue`, patterns, and small pure helpers. |
| `AssetSchema.ts` | Schema description: field types, shape rules, reference rules, category restrictions, and the structural property check. |
| `AssetDefinition.ts` | The core model: metadata, `schemaId`, `status`, `properties`, `references`, `dependencies`, `customData`. Normalizes input and guards shape. |
| `AssetReference.ts` | A directed link from one asset to another (`referenceId`, `referenceType`, optional `targetVersion`). |
| `AssetDependency.ts` | Dependency edges, a deterministic graph, and cycle detection. |
| `AssetRegistry.ts` | An instance-based registry: register, remove, lookup, sorted listing, category filter. |
| `AssetValidator.ts` | Structural validation: missing fields, invalid categories and ids, duplicates, invalid references, cycles, schema mismatch. |
| `AssetSerializer.ts` | Canonical JSON export and strict import, plus a stable fingerprint. Strings only. |
| `AssetMigration.ts` | Version comparison, compatibility checks, and migration *plans* (descriptions only). |

## Data model

An `AssetDefinition` is plain data:

- `metadata`: `id`, `name`, `version`, `category`, `description`, `tags`, `authoringSource`, `createdAt`, `updatedAt`
- `schemaId`: the schema the asset claims to follow
- `status`: declared lifecycle (`DRAFT`, `VALID`, `INVALID`, `DEPRECATED`)
- `properties`: a JSON object shaped by the schema
- `references`: links to other assets by id
- `dependencies`: load or authoring order relationships
- `customData`: free-form JSON, not interpreted by this layer

Everything is JSON-serializable. Timestamps are supplied by callers, so the
layer never reads the clock and output is reproducible.

## Determinism rules

- `createAssetDefinition` deep-copies its input, deduplicates and sorts tags,
  and sorts references and dependencies.
- The registry stores copies and always lists assets sorted by id.
- Serialization sorts object keys recursively and sorts assets by id.
- The validator sorts issues and statuses. Ordering uses plain code-point
  comparison, not locale collation.
- `fingerprintAsset` gives a stable FNV-1a hash of canonical JSON.

## Schema example (illustrative only)

Schemas describe structure. The following is documentation, not shipped content.

```json
{
  "schemaId": "enemy_basic",
  "schemaVersion": "1.0.0",
  "name": "Basic enemy",
  "description": "Structure for an enemy definition.",
  "appliesTo": ["ENEMY"],
  "fields": [
    { "name": "health", "type": "number", "required": true, "description": "Hit points.", "rules": { "minimum": 0 } },
    { "name": "attack", "type": "number", "required": true, "description": "Attack value.", "rules": { "minimum": 0 } },
    { "name": "behavior", "type": "string", "required": false, "description": "Behavior label.", "rules": { "enumValues": ["PATROL", "GUARD"] } },
    { "name": "stats", "type": "object", "required": false, "description": "Grouped stats.", "rules": {} }
  ],
  "referenceRules": [
    { "referenceType": "skill", "targetCategories": ["SKILL"], "required": false, "maxCount": 8 }
  ],
  "allowUnknownProperties": false
}
```

A matching definition:

```json
{
  "metadata": {
    "id": "enemy_scout", "name": "Scout", "version": "1.0.0", "category": "ENEMY",
    "description": "A fast, fragile enemy.", "tags": ["early"], "authoringSource": "MANUAL",
    "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
  },
  "schemaId": "enemy_basic",
  "status": "DRAFT",
  "properties": { "health": 500, "attack": 50, "behavior": "PATROL" },
  "references": [{ "referenceId": "skill_dash", "referenceType": "skill", "targetVersion": "1.0.0" }],
  "dependencies": [{ "targetId": "anim_scout_idle", "dependencyType": "animation" }],
  "customData": {}
}
```

The `500` and `50` values are sample data. The layer checks only that the
fields exist, have the declared type, and meet the declared shape rules.

## Relationship with the Schema Layer

`src/authoring/schema` defines the authoritative schema for authoring data.
This layer has its own schema description (`AssetSchema`) for asset properties.
It does not import the existing schema module, so the two stay independent. A
future adapter can map between them through plain JSON. Nothing here depends
on the existing schema layer.

## Relationship with the Generator Layer

The Generator (`src/authoring/generator`) consumes validated, normalized
definitions in a future phase. This layer does not generate code, does not
call a backend, and does not write output. Generators will read
`AssetRegistry` contents or the serialized envelope.

## Relationship with the Validator

`src/authoring/validator` checks authoring source and IR for structural
problems. `AssetValidator` checks asset definitions for structural problems.
Both follow the same rule: report structure, never balance or taste. The two
validators are separate, and neither calls the other.

## Relationship with Verification

`src/authoring/verification` checks generated artifacts and build outcomes
after generation. Asset validation runs earlier, on the content itself.
Verification may consume `ValidationReport` as evidence in a future phase, but
this layer does not depend on it.

## Relationship with Safe Repair

`src/authoring/safe-repair` applies small, approved fixes to in-memory
documents. This layer never repairs assets automatically. `AssetValidator`
reports problems and gives each one a stable `code` and `path`. A future repair
step may use these, but each change would still need explicit approval.
`AssetMigration` describes version changes and does not rewrite data.

## Validation scope

Checked:

- required fields are present and non-empty
- ids match the identifier pattern, and versions are `MAJOR.MINOR.PATCH`
- categories and statuses are known
- timestamps are UTC ISO-8601
- duplicate asset ids and duplicate schema ids
- `properties` match the schema: required, type, shape rules, unknown keys
- category is allowed by the schema
- references and dependencies point to existing assets
- reference type is declared, and the target's category is allowed
- required and maximum reference counts
- dependency cycles (each member is reported)

Not checked (by design):

- whether a number is balanced, fair, or fun
- whether a skill suits an enemy
- narrative, art, or audio quality

Schema `minimum` and `maximum` are structural bounds declared by a schema
author. The layer does not decide what good values are.

## Why this is not Phase 3 AI generation

This layer:

- does not call an external AI API or model
- does not create agents that act on their own
- does not generate or rewrite content
- does not touch the engine, runtime, gameplay, UI, rendering, or game files
- does not read or write the filesystem, use the network, run subprocesses, or use git

It defines what content looks like and checks its structure. A later phase
may let an AI produce definitions in this format, but that is a separate,
reviewed step.

## Safety boundaries

- Imports are limited to sibling files in this folder.
- No React, canvas, WebGL, DOM, engine, runtime, game, or UI imports.
- No `Date.now`, `Math.random`, or other non-deterministic sources.
- No global mutable state. The registry is an instance.
- No functions, classes with inheritance, or executable code in data.
- Every file is under 250 lines, and every function is under 60 lines.
