/**
 * PRESERVE Authoring System — Schema layer.
 *
 * SchemaValidator.ts validates schema *structure* only: required fields,
 * version format, identifier shape, tag validity, duplicate identifiers,
 * deprecated references, and circular metadata dependencies.
 *
 * It never validates gameplay balance, rendering, or behavior. Validation is
 * linear in the number of schemas and their declared dependencies.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SchemaDefinition, SchemaStatus } from './SchemaTypes';
import { isValidVersion } from './SchemaVersion';

/** Severity of a single validation finding. */
export type IssueSeverity = 'error' | 'warning';

/** One structural finding produced by the validator. */
export interface ValidationIssue {
  /** Whether the finding blocks acceptance or is advisory. */
  readonly severity: IssueSeverity;
  /** Stable machine-readable code, useful for tooling and AI agents. */
  readonly code: string;
  /** Human-readable explanation of the finding. */
  readonly message: string;
  /** Identifier of the schema the finding relates to, when applicable. */
  readonly schemaId?: string;
  /** Field or property path the finding relates to, when applicable. */
  readonly path?: string;
}

/** Aggregate outcome of a validation pass. */
export interface ValidationResult {
  /** True when no `error`-severity issues were produced. */
  readonly valid: boolean;
  /** Every finding, in discovery order. */
  readonly issues: readonly ValidationIssue[];
  /** Count of `error`-severity findings. */
  readonly errorCount: number;
  /** Count of `warning`-severity findings. */
  readonly warningCount: number;
}

const VALID_STATUSES: readonly SchemaStatus[] = ['draft', 'review', 'stable', 'deprecated', 'archived'];
const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Build a {@link ValidationResult} from a list of issues. */
function buildResult(issues: ValidationIssue[]): ValidationResult {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
  };
}

/** Validate the required top-level fields of a single schema. */
function validateRequiredFields(schema: SchemaDefinition, issues: ValidationIssue[]): void {
  const id = schema.id;
  const required: [keyof SchemaDefinition, string][] = [
    ['id', 'id'],
    ['name', 'name'],
    ['displayName', 'displayName'],
    ['category', 'category'],
    ['author', 'author'],
    ['createdAt', 'createdAt'],
    ['updatedAt', 'updatedAt'],
  ];
  for (const [key, path] of required) {
    const value = schema[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push({ severity: 'error', code: 'MISSING_REQUIRED_FIELD', message: `Field "${path}" is required and must be a non-empty string.`, schemaId: id, path });
    }
  }
  if (typeof schema.description !== 'string') {
    issues.push({ severity: 'error', code: 'INVALID_DESCRIPTION', message: 'Field "description" must be a string.', schemaId: id, path: 'description' });
  }
  if (!Array.isArray(schema.tags)) {
    issues.push({ severity: 'error', code: 'INVALID_TAGS', message: 'Field "tags" must be an array.', schemaId: id, path: 'tags' });
  }
  if (!Array.isArray(schema.fields)) {
    issues.push({ severity: 'error', code: 'INVALID_FIELDS', message: 'Field "fields" must be an array.', schemaId: id, path: 'fields' });
  }
  if (schema.metadata === undefined || schema.metadata === null) {
    issues.push({ severity: 'error', code: 'MISSING_METADATA', message: 'Field "metadata" is required.', schemaId: id, path: 'metadata' });
  }
}

/** Validate identifier shape, version format, status, and tag format. */
function validateShape(schema: SchemaDefinition, issues: ValidationIssue[]): void {
  const id = schema.id;
  if (typeof schema.name === 'string' && schema.name.length > 0 && !IDENTIFIER_PATTERN.test(schema.name)) {
    issues.push({ severity: 'error', code: 'INVALID_NAME_FORMAT', message: `Name "${schema.name}" must start with a letter and contain only letters and digits.`, schemaId: id, path: 'name' });
  }
  if (!isValidVersion(schema.version)) {
    issues.push({ severity: 'error', code: 'INVALID_VERSION', message: 'Field "version" must contain non-negative integer major, minor, and patch components.', schemaId: id, path: 'version' });
  }
  if (schema.metadata && !isValidVersion(schema.metadata.version)) {
    issues.push({ severity: 'error', code: 'INVALID_METADATA_VERSION', message: 'Field "metadata.version" must be a valid semantic version.', schemaId: id, path: 'metadata.version' });
  }
  if (!VALID_STATUSES.includes(schema.status)) {
    issues.push({ severity: 'error', code: 'INVALID_STATUS', message: `Status "${String(schema.status)}" is not a recognised schema status.`, schemaId: id, path: 'status' });
  }
  if (Array.isArray(schema.tags)) {
    const seen = new Set<string>();
    for (const tag of schema.tags) {
      if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) {
        issues.push({ severity: 'error', code: 'INVALID_TAG', message: `Tag "${String(tag)}" must be lowercase alphanumeric with optional hyphens.`, schemaId: id, path: 'tags' });
        continue;
      }
      if (seen.has(tag)) {
        issues.push({ severity: 'warning', code: 'DUPLICATE_TAG', message: `Tag "${tag}" is listed more than once.`, schemaId: id, path: 'tags' });
      }
      seen.add(tag);
    }
  }
}

/** Validate declared field descriptions and detect duplicate field names. */
function validateFields(schema: SchemaDefinition, issues: ValidationIssue[]): void {
  if (!Array.isArray(schema.fields)) return;
  const seen = new Set<string>();
  for (const field of schema.fields) {
    if (typeof field?.name !== 'string' || field.name.length === 0) {
      issues.push({ severity: 'error', code: 'INVALID_FIELD_NAME', message: 'Every field requires a non-empty name.', schemaId: schema.id, path: 'fields' });
      continue;
    }
    if (seen.has(field.name)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_FIELD_NAME', message: `Field name "${field.name}" is declared more than once.`, schemaId: schema.id, path: `fields.${field.name}` });
    }
    seen.add(field.name);
    if (typeof (field as { defaultValue?: unknown }).defaultValue === 'function') {
      issues.push({ severity: 'error', code: 'FUNCTION_IN_SCHEMA', message: `Field "${field.name}" must not contain a function; schemas hold data only.`, schemaId: schema.id, path: `fields.${field.name}` });
    }
    if (field.valueType === 'reference' && field.referenceCategory === undefined) {
      issues.push({ severity: 'warning', code: 'MISSING_REFERENCE_CATEGORY', message: `Reference field "${field.name}" should declare a referenceCategory.`, schemaId: schema.id, path: `fields.${field.name}` });
    }
  }
}

/**
 * Validate one schema in isolation.
 * Checks required fields, identifier and version format, status, tags, and
 * field declarations. Does not inspect cross-schema relationships.
 */
export function validateSchema(schema: SchemaDefinition): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateRequiredFields(schema, issues);
  validateShape(schema, issues);
  validateFields(schema, issues);
  if (schema.metadata?.deprecated && !schema.metadata.deprecationReason) {
    issues.push({ severity: 'warning', code: 'MISSING_DEPRECATION_REASON', message: 'Deprecated schemas should explain the deprecation.', schemaId: schema.id, path: 'metadata.deprecationReason' });
  }
  return buildResult(issues);
}

/** Detect duplicate identifiers across a collection of schemas. */
function validateDuplicates(schemas: readonly SchemaDefinition[], issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  for (const schema of schemas) {
    if (seen.has(schema.id)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_SCHEMA_ID', message: `Schema identifier "${schema.id}" is registered more than once.`, schemaId: schema.id });
    }
    seen.add(schema.id);
  }
}

/** Detect missing and deprecated dependency targets. */
function validateReferences(schemas: readonly SchemaDefinition[], byId: Map<string, SchemaDefinition>, issues: ValidationIssue[]): void {
  for (const schema of schemas) {
    for (const dependency of schema.metadata?.dependencies ?? []) {
      const target = byId.get(dependency.schemaId);
      if (!target) {
        if (dependency.optional !== true) {
          issues.push({ severity: 'error', code: 'UNKNOWN_DEPENDENCY', message: `Schema "${schema.id}" depends on unknown schema "${dependency.schemaId}".`, schemaId: schema.id, path: 'metadata.dependencies' });
        }
        continue;
      }
      if (target.metadata?.deprecated) {
        issues.push({ severity: 'warning', code: 'DEPRECATED_DEPENDENCY', message: `Schema "${schema.id}" depends on deprecated schema "${target.id}".`, schemaId: schema.id, path: 'metadata.dependencies' });
      }
    }
  }
}

/** Detect circular metadata dependency chains using depth-first traversal. */
function validateCycles(schemas: readonly SchemaDefinition[], byId: Map<string, SchemaDefinition>, issues: ValidationIssue[]): void {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (id: string, trail: string[]): void => {
    if (stack.has(id)) {
      issues.push({ severity: 'error', code: 'CIRCULAR_DEPENDENCY', message: `Circular dependency detected: ${[...trail, id].join(' -> ')}.`, schemaId: id, path: 'metadata.dependencies' });
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const dependency of byId.get(id)?.metadata?.dependencies ?? []) {
      if (byId.has(dependency.schemaId)) visit(dependency.schemaId, [...trail, id]);
    }
    stack.delete(id);
  };

  for (const schema of schemas) visit(schema.id, []);
}

/**
 * Validate a collection of schemas.
 *
 * Runs every per-schema check, then cross-schema checks: duplicate
 * identifiers, unknown or deprecated dependency targets, and circular
 * metadata dependencies. Complexity is linear in schemas plus dependencies.
 */
export function validateSchemaCollection(schemas: readonly SchemaDefinition[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const schema of schemas) issues.push(...validateSchema(schema).issues);
  validateDuplicates(schemas, issues);
  const byId = new Map(schemas.map((schema) => [schema.id, schema]));
  validateReferences(schemas, byId, issues);
  validateCycles(schemas, byId, issues);
  return buildResult(issues);
}

/** Render a result as readable lines, useful for logs and reports. */
export function formatValidationResult(result: ValidationResult): string {
  if (result.issues.length === 0) return 'Schema validation passed with no issues.';
  const lines = result.issues.map((issue) => {
    const where = issue.schemaId ? ` [${issue.schemaId}${issue.path ? `:${issue.path}` : ''}]` : '';
    return `  ${issue.severity.toUpperCase()} ${issue.code}${where}: ${issue.message}`;
  });
  return [`Schema validation: ${result.errorCount} error(s), ${result.warningCount} warning(s)`, ...lines].join('\n');
}
