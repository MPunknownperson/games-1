/**
 * A reference is a directed link from one asset to another asset by id,
 * e.g. Enemy -> Skill, or Character -> Weapon.
 *
 * This module checks reference shape, schema reference rules (declared types,
 * required types, maximum counts), and target conformance (existence, version,
 * category). AssetValidator supplies the target lookup.
 */
import {
  ASSET_ID_PATTERN,
  SEMVER_PATTERN,
  TYPE_LABEL_PATTERN,
  compareStrings,
  errorDraft,
  isAssetCategory,
  warningDraft,
  type AssetMetadata,
  type IssueDraft,
} from "./AssetTypes";
import type { ReferenceRule } from "./AssetSchema";

export interface AssetReference {
  /** Id of the referenced (target) asset. */
  referenceId: string;
  /** Machine-readable label for the kind of link, e.g. "skill", "weapon". */
  referenceType: string;
  /** Optional expected target version (MAJOR.MINOR.PATCH). */
  targetVersion?: string;
}

/** Builds a reference. `targetVersion` is omitted from the object when not supplied. */
export function createAssetReference(
  referenceId: string,
  referenceType: string,
  targetVersion?: string,
): AssetReference {
  const ref: AssetReference = { referenceId, referenceType };
  if (targetVersion !== undefined) ref.targetVersion = targetVersion;
  return ref;
}

/** Deterministic order: by referenceType, then referenceId. Returns a new array. */
export function sortReferences(references: AssetReference[]): AssetReference[] {
  return [...references].sort(
    (a, b) =>
      compareStrings(a.referenceType, b.referenceType) ||
      compareStrings(a.referenceId, b.referenceId),
  );
}

/** Shape-only validation of one reference. */
export function validateAssetReference(ref: AssetReference, path: string): IssueDraft[] {
  const issues: IssueDraft[] = [];
  if (!ASSET_ID_PATTERN.test(ref.referenceId)) {
    issues.push(errorDraft("INVALID_REFERENCE_ID", `${path}.referenceId`, `Reference id "${ref.referenceId}" is not a valid asset identifier.`));
  }
  if (!TYPE_LABEL_PATTERN.test(ref.referenceType)) {
    issues.push(errorDraft("INVALID_REFERENCE_TYPE", `${path}.referenceType`, `Reference type "${ref.referenceType}" must be a lowercase label.`));
  }
  if (ref.targetVersion !== undefined && !SEMVER_PATTERN.test(ref.targetVersion)) {
    issues.push(errorDraft("INVALID_REFERENCE_VERSION", `${path}.targetVersion`, `Target version "${ref.targetVersion}" must be MAJOR.MINOR.PATCH.`));
  }
  return issues;
}

/** Shape-only validation of one schema reference rule. */
export function validateReferenceRule(rule: ReferenceRule, index: number): IssueDraft[] {
  const base = `referenceRules[${index}]`;
  const issues: IssueDraft[] = [];
  if (!TYPE_LABEL_PATTERN.test(rule.referenceType)) {
    issues.push(errorDraft("SCHEMA_INVALID_REFERENCE_TYPE", `${base}.referenceType`, `Reference type "${rule.referenceType}" is invalid.`));
  }
  rule.targetCategories.forEach((category, i) => {
    if (!isAssetCategory(category)) {
      issues.push(errorDraft("SCHEMA_INVALID_CATEGORY", `${base}.targetCategories[${i}]`, `Unknown category "${String(category)}".`));
    }
  });
  if (rule.maxCount !== null && (!Number.isInteger(rule.maxCount) || rule.maxCount < 0)) {
    issues.push(errorDraft("SCHEMA_INVALID_RULE", `${base}.maxCount`, "maxCount must be null or a non-negative integer."));
  }
  return issues;
}

/**
 * Checks one reference's target against the index and the schema rule for its type.
 * `target` is undefined when no asset has the referenced id.
 */
export function checkReferenceTarget(
  ref: AssetReference,
  path: string,
  target: AssetMetadata | undefined,
  rule: ReferenceRule | undefined,
): IssueDraft[] {
  if (target === undefined) {
    return [errorDraft("INVALID_REFERENCE", `${path}.referenceId`, `Referenced asset "${ref.referenceId}" does not exist.`)];
  }
  const issues: IssueDraft[] = [];
  if (ref.targetVersion !== undefined && ref.targetVersion !== target.version) {
    issues.push(warningDraft("REFERENCE_VERSION_MISMATCH", `${path}.targetVersion`, `Expected version ${ref.targetVersion} but "${ref.referenceId}" is ${target.version}.`));
  }
  if (rule !== undefined && rule.targetCategories.length > 0 && !rule.targetCategories.includes(target.category)) {
    issues.push(errorDraft("REFERENCE_CATEGORY_MISMATCH", `${path}.referenceId`, `Target "${ref.referenceId}" is ${target.category}, which the rule for "${ref.referenceType}" does not allow.`));
  }
  return issues;
}

/** Schema reference rules: undeclared types, required types, and maximum counts. */
export function checkReferenceRules(rules: ReferenceRule[], references: AssetReference[]): IssueDraft[] {
  const issues: IssueDraft[] = [];
  references.forEach((ref, i) => {
    if (!rules.some((r) => r.referenceType === ref.referenceType)) {
      issues.push(errorDraft("UNDECLARED_REFERENCE_TYPE", `references[${i}].referenceType`, `Reference type "${ref.referenceType}" is not declared by the schema.`));
    }
  });
  for (const rule of rules) {
    const count = references.filter((r) => r.referenceType === rule.referenceType).length;
    if (rule.required && count === 0) {
      issues.push(errorDraft("MISSING_REFERENCE", "references", `Schema requires a reference of type "${rule.referenceType}".`));
    }
    if (rule.maxCount !== null && count > rule.maxCount) {
      issues.push(errorDraft("REFERENCE_LIMIT_EXCEEDED", "references", `Reference type "${rule.referenceType}" allows at most ${rule.maxCount}.`));
    }
  }
  return issues;
}
