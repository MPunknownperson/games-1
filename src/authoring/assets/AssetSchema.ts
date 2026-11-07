/**
 * Declarative schema description for asset properties and reference rules.
 *
 * A schema describes the STRUCTURE of an asset's `properties`: which fields exist,
 * their types, shape rules, and which categories and reference types are allowed.
 * It does not contain gameplay logic and does not judge balance.
 */
import {
  ASSET_ID_PATTERN,
  SEMVER_PATTERN,
  cloneJson,
  compareStrings,
  errorDraft,
  findDuplicates,
  isAssetCategory,
  isJsonObject,
  safeRegExp,
  uniqueSorted,
  type AssetCategory,
  type IssueDraft,
  type JsonObject,
  type JsonValue,
} from "./AssetTypes";
import { validateReferenceRule } from "./AssetReference";

export const FIELD_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "string_array",
  "object",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Field name pattern: identifier-like, allows camelCase. */
export const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * Declarative shape constraints. `minimum`/`maximum` are structural range
 * limits declared by the schema author; the layer never judges whether a
 * value is balanced or fair.
 */
export interface FieldRules {
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enumValues?: string[];
}

export interface FieldSchema {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
  rules: FieldRules;
}

/** Declares which reference types an asset may (or must) carry. */
export interface ReferenceRule {
  referenceType: string;
  /** Allowed target categories. Empty array means any category. */
  targetCategories: AssetCategory[];
  required: boolean;
  /** Maximum number of references of this type. `null` means unbounded. */
  maxCount: number | null;
}

export interface AssetSchema {
  schemaId: string;
  schemaVersion: string;
  name: string;
  description: string;
  appliesTo: AssetCategory[];
  fields: FieldSchema[];
  referenceRules: ReferenceRule[];
  allowUnknownProperties: boolean;
}

/** Returns a normalized copy: sorted fields, sorted rules, unique sorted categories. */
export function createAssetSchema(input: AssetSchema): AssetSchema {
  const copy = cloneJson(input);
  return {
    ...copy,
    appliesTo: uniqueSorted(copy.appliesTo),
    fields: [...copy.fields].sort((a, b) => compareStrings(a.name, b.name)),
    referenceRules: [...copy.referenceRules].sort((a, b) =>
      compareStrings(a.referenceType, b.referenceType),
    ),
  };
}

function validateFieldRules(field: FieldSchema, base: string): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const r = field.rules;
  if (r.minimum !== undefined && r.maximum !== undefined && r.minimum > r.maximum) {
    issues.push(errorDraft("SCHEMA_INVALID_RULE", base, "minimum is greater than maximum."));
  }
  if (r.minLength !== undefined && r.maxLength !== undefined && r.minLength > r.maxLength) {
    issues.push(errorDraft("SCHEMA_INVALID_RULE", base, "minLength is greater than maxLength."));
  }
  if (r.pattern !== undefined && safeRegExp(r.pattern) === null) {
    issues.push(errorDraft("SCHEMA_INVALID_RULE", base, "pattern is not a valid regular expression."));
  }
  if (r.enumValues !== undefined && r.enumValues.length === 0) {
    issues.push(errorDraft("SCHEMA_INVALID_RULE", base, "enumValues must not be empty."));
  }
  return issues;
}

function validateFieldSchema(field: FieldSchema, index: number): IssueDraft[] {
  const base = `fields[${index}]`;
  const issues: IssueDraft[] = [];
  if (!FIELD_NAME_PATTERN.test(field.name)) {
    issues.push(errorDraft("SCHEMA_INVALID_FIELD_NAME", `${base}.name`, `Field name "${field.name}" is invalid.`));
  }
  if (!(FIELD_TYPES as readonly string[]).includes(field.type)) {
    issues.push(errorDraft("SCHEMA_INVALID_FIELD_TYPE", `${base}.type`, `Unknown field type "${field.type}".`));
  }
  return issues.concat(validateFieldRules(field, base));
}

/** Structural self-check of a schema. Returns issues; never throws. */
export function validateSchemaDefinition(schema: AssetSchema): IssueDraft[] {
  const issues: IssueDraft[] = [];
  if (!ASSET_ID_PATTERN.test(schema.schemaId)) {
    issues.push(errorDraft("SCHEMA_INVALID_ID", "schemaId", `Schema id "${schema.schemaId}" is invalid.`));
  }
  if (!SEMVER_PATTERN.test(schema.schemaVersion)) {
    issues.push(errorDraft("SCHEMA_INVALID_VERSION", "schemaVersion", `Schema version "${schema.schemaVersion}" must be MAJOR.MINOR.PATCH.`));
  }
  if (schema.appliesTo.length === 0) {
    issues.push(errorDraft("SCHEMA_NO_CATEGORIES", "appliesTo", "Schema must apply to at least one category."));
  }
  schema.appliesTo.forEach((category, i) => {
    if (!isAssetCategory(category)) {
      issues.push(errorDraft("SCHEMA_INVALID_CATEGORY", `appliesTo[${i}]`, `Unknown category "${String(category)}".`));
    }
  });
  for (const name of findDuplicates(schema.fields.map((f) => f.name))) {
    issues.push(errorDraft("SCHEMA_DUPLICATE_FIELD", "fields", `Field "${name}" is declared more than once.`));
  }
  for (const type of findDuplicates(schema.referenceRules.map((r) => r.referenceType))) {
    issues.push(errorDraft("SCHEMA_DUPLICATE_REFERENCE_RULE", "referenceRules", `Reference type "${type}" has more than one rule.`));
  }
  schema.fields.forEach((field, i) => issues.push(...validateFieldSchema(field, i)));
  schema.referenceRules.forEach((rule, i) => issues.push(...validateReferenceRule(rule, i)));
  return issues;
}

export function checkFieldType(type: FieldType, value: JsonValue): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "string_array":
      return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "object":
      return isJsonObject(value);
    default:
      return false;
  }
}

function checkNumberRules(rules: FieldRules, value: number): string | null {
  if (rules.minimum !== undefined && value < rules.minimum) {
    return `must be >= ${rules.minimum}.`;
  }
  if (rules.maximum !== undefined && value > rules.maximum) {
    return `must be <= ${rules.maximum}.`;
  }
  return null;
}

function checkStringRules(rules: FieldRules, value: string): string | null {
  if (rules.minLength !== undefined && value.length < rules.minLength) {
    return `length must be >= ${rules.minLength}.`;
  }
  if (rules.maxLength !== undefined && value.length > rules.maxLength) {
    return `length must be <= ${rules.maxLength}.`;
  }
  if (rules.pattern !== undefined) {
    const regex = safeRegExp(rules.pattern);
    if (regex === null || !regex.test(value)) return "does not match the required pattern.";
  }
  if (rules.enumValues !== undefined && !rules.enumValues.includes(value)) {
    return `must be one of: ${rules.enumValues.join(", ")}.`;
  }
  return null;
}

/** Returns a human-readable rule violation, or null when all shape rules pass. */
export function checkFieldRules(field: FieldSchema, value: JsonValue): string | null {
  const rules = field.rules;
  if (typeof value === "number") return checkNumberRules(rules, value);
  if (typeof value === "string") return checkStringRules(rules, value);
  if (Array.isArray(value) && rules.enumValues !== undefined) {
    const allowed = rules.enumValues;
    const bad = value.find((item) => typeof item !== "string" || !allowed.includes(item));
    if (bad !== undefined) return `items must be one of: ${allowed.join(", ")}.`;
  }
  return null;
}

function checkDeclaredField(field: FieldSchema, properties: JsonObject, issues: IssueDraft[]): void {
  const path = `properties.${field.name}`;
  if (!Object.prototype.hasOwnProperty.call(properties, field.name)) {
    if (field.required) {
      issues.push(errorDraft("MISSING_REQUIRED_FIELD", path, `Required field "${field.name}" is missing.`));
    }
    return;
  }
  const value = properties[field.name];
  if (!checkFieldType(field.type, value)) {
    issues.push(errorDraft("TYPE_MISMATCH", path, `Field "${field.name}" must be of type ${field.type}.`));
    return;
  }
  const problem = checkFieldRules(field, value);
  if (problem !== null) {
    issues.push(errorDraft("RULE_VIOLATION", path, `Field "${field.name}" ${problem}`));
  }
}

/** Checks an asset's `properties` against a schema. Structure only, never balance. */
export function checkProperties(schema: AssetSchema, properties: JsonObject): IssueDraft[] {
  const issues: IssueDraft[] = [];
  for (const field of schema.fields) {
    checkDeclaredField(field, properties, issues);
  }
  if (!schema.allowUnknownProperties) {
    const declared = new Set(schema.fields.map((f) => f.name));
    for (const key of Object.keys(properties).sort(compareStrings)) {
      if (!declared.has(key)) {
        issues.push(errorDraft("UNKNOWN_PROPERTY", `properties.${key}`, `Property "${key}" is not declared by schema "${schema.schemaId}".`));
      }
    }
  }
  return issues;
}
