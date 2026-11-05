/**
 * PRESERVE Authoring System — Validation System.
 *
 * SchemaValidatorAdapter.ts bridges the existing Schema layer validator into
 * the Validation System. It deliberately does NOT reimplement schema checks:
 * it delegates to `validateSchema` / `validateSchemaCollection` and translates
 * their findings into {@link ValidationIssue} records.
 *
 * A small number of adapter-only rules cover concerns the schema layer treats
 * as out of scope (for example, an entirely absent payload).
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  validateSchema,
  validateSchemaCollection,
  type ValidationIssue as SchemaIssue,
  type ValidationResult as SchemaValidationResult,
} from '../schema/SchemaValidator';
import type { SchemaDefinition } from '../schema/SchemaTypes';
import { defineRule, defineValidator, type ValidationRule, type Validator } from './ValidationRule';
import {
  ValidationSeverity,
  ValidationTargetKind,
  createIssue,
  type ValidationIssue,
} from './ValidatorTypes';

/** Map a schema-layer severity onto a validation-system severity. */
function mapSeverity(severity: SchemaIssue['severity']): ValidationSeverity {
  return severity === 'error' ? ValidationSeverity.ERROR : ValidationSeverity.WARNING;
}

/** Translate one schema-layer issue into a validation-system issue. */
function translateIssue(issue: SchemaIssue): ValidationIssue {
  return createIssue(issue.code, issue.message, {
    severity: mapSeverity(issue.severity),
    location: { file: issue.schemaId, path: issue.path },
  });
}

/** Translate a whole schema-layer result into validation-system issues. */
export function translateSchemaResult(result: SchemaValidationResult): ValidationIssue[] {
  return result.issues.map(translateIssue);
}

/** Whether a value looks like a schema definition or a list of them. */
function isSchemaLike(value: unknown): value is SchemaDefinition {
  return Boolean(value) && typeof value === 'object' && 'id' in (value as object);
}

/** Rule: the target must actually contain a schema payload. */
const payloadPresenceRule: ValidationRule<unknown> = defineRule({
  id: 'schema.payload.missing',
  name: 'Schema payload present',
  description: 'The validation target must contain a schema definition or an array of them.',
  validate: (target) => {
    if (target === undefined || target === null) {
      return [
        createIssue('SCHEMA_PAYLOAD_MISSING', 'No schema payload was supplied for validation.', {
          suggestion: 'Pass a SchemaDefinition or an array of SchemaDefinition objects.',
        }),
      ];
    }
    if (Array.isArray(target)) {
      return target.length === 0
        ? [
            createIssue('SCHEMA_COLLECTION_EMPTY', 'Schema collection is empty.', {
              severity: ValidationSeverity.WARNING,
              suggestion: 'Register at least one schema before validating the collection.',
            }),
          ]
        : [];
    }
    if (!isSchemaLike(target)) {
      return [
        createIssue('SCHEMA_PAYLOAD_INVALID', 'Payload does not resemble a schema definition.', {
          suggestion: 'Ensure the payload is a SchemaDefinition with at least an `id` field.',
        }),
      ];
    }
    return [];
  },
});

/** Rule: delegate structural checks to the existing schema layer validator. */
const delegatedStructureRule: ValidationRule<unknown> = defineRule({
  id: 'schema.structure.delegated',
  name: 'Schema structure (delegated)',
  description:
    'Delegates required fields, version format, dependency, and metadata checks to the Schema layer validator.',
  validate: (target) => {
    if (target === undefined || target === null) return [];
    if (Array.isArray(target)) {
      if (target.length === 0) return [];
      return translateSchemaResult(validateSchemaCollection(target as readonly SchemaDefinition[]));
    }
    if (!isSchemaLike(target)) return [];
    return translateSchemaResult(validateSchema(target));
  },
});

/** Rule: surface schemas that declare no authored fields. */
const fieldCoverageRule: ValidationRule<unknown> = defineRule({
  id: 'schema.fields.empty',
  name: 'Schema declares fields',
  description: 'Advises when a schema definition declares no fields.',
  validate: (target) => {
    const issues: ValidationIssue[] = [];
    const inspect = (schema: unknown): void => {
      if (!isSchemaLike(schema)) return;
      const fields = (schema as { fields?: unknown }).fields;
      if (Array.isArray(fields) && fields.length === 0) {
        issues.push(
          createIssue('SCHEMA_NO_FIELDS', `Schema "${schema.id}" declares no fields.`, {
            severity: ValidationSeverity.INFO,
            location: { file: schema.id, path: 'fields' },
            suggestion: 'Add field descriptors, or confirm the schema is intentionally empty.',
          }),
        );
      }
    };
    if (Array.isArray(target)) target.forEach(inspect);
    else inspect(target);
    return issues;
  },
});

/** Every rule the schema adapter executes, in a stable order. */
export const SCHEMA_VALIDATION_RULES: readonly ValidationRule<unknown>[] = [
  payloadPresenceRule,
  delegatedStructureRule,
  fieldCoverageRule,
];

/** Validator adapting the Schema layer into the Validation System. */
export const schemaValidatorAdapter: Validator<unknown> = defineValidator({
  id: 'schema-validator',
  name: 'Schema Validator Adapter',
  targetKind: ValidationTargetKind.SCHEMA,
  rules: SCHEMA_VALIDATION_RULES,
});

/** Create a fresh schema adapter, optionally with a custom identifier. */
export function createSchemaValidatorAdapter(id = 'schema-validator'): Validator<unknown> {
  return defineValidator({
    id,
    name: 'Schema Validator Adapter',
    targetKind: ValidationTargetKind.SCHEMA,
    rules: SCHEMA_VALIDATION_RULES,
  });
}
