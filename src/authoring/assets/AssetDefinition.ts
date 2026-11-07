/**
 * The core asset definition model.
 *
 * An AssetDefinition is generic content data: metadata, the id of the schema it
 * claims to follow, a property bag, references, dependencies, and free-form
 * customData. It contains no gameplay behavior and no game-specific systems.
 */
import {
  ASSET_ID_PATTERN,
  ISO_TIMESTAMP_PATTERN,
  SEMVER_PATTERN,
  cloneJson,
  errorDraft,
  isAssetCategory,
  isAssetStatus,
  isAuthoringSource,
  isJsonObject,
  requiredTextIssue,
  uniqueSorted,
  type AssetMetadata,
  type AssetStatus,
  type IssueDraft,
  type JsonObject,
} from "./AssetTypes";
import { sortReferences, type AssetReference } from "./AssetReference";
import { sortDependencies, type AssetDependency } from "./AssetDependency";

export interface AssetDefinition {
  metadata: AssetMetadata;
  schemaId: string;
  /** Declared lifecycle status. Effective validation status is computed by AssetValidator. */
  status: AssetStatus;
  properties: JsonObject;
  references: AssetReference[];
  dependencies: AssetDependency[];
  customData: JsonObject;
}

export interface AssetDefinitionInput {
  metadata: AssetMetadata;
  schemaId: string;
  status?: AssetStatus;
  properties?: JsonObject;
  references?: AssetReference[];
  dependencies?: AssetDependency[];
  customData?: JsonObject;
}

/**
 * Builds a normalized definition. The input is deep-copied, so later changes to
 * the caller's objects do not affect the result. Tags are deduplicated and
 * sorted, references and dependencies are sorted, and missing optional fields
 * get defaults (status DRAFT, empty objects and arrays).
 */
export function createAssetDefinition(input: AssetDefinitionInput): AssetDefinition {
  const copy = cloneJson(input);
  return {
    metadata: { ...copy.metadata, tags: uniqueSorted(copy.metadata.tags) },
    schemaId: copy.schemaId,
    status: copy.status ?? "DRAFT",
    properties: copy.properties ?? {},
    references: sortReferences(copy.references ?? []),
    dependencies: sortDependencies(copy.dependencies ?? []),
    customData: copy.customData ?? {},
  };
}

/** Deep copy of a definition. Use this before handing definitions out of a registry. */
export function cloneDefinition(definition: AssetDefinition): AssetDefinition {
  return cloneJson(definition);
}

/** Returns a copy of the definition with a different declared status. */
export function withStatus(definition: AssetDefinition, status: AssetStatus): AssetDefinition {
  return { ...cloneDefinition(definition), status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMetadataShape(value: unknown): value is AssetMetadata {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.version === "string" &&
    isAssetCategory(value.category) &&
    typeof value.description === "string" &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    isAuthoringSource(value.authoringSource) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isReferenceShape(value: unknown): value is AssetReference {
  if (!isRecord(value)) return false;
  return (
    typeof value.referenceId === "string" &&
    typeof value.referenceType === "string" &&
    (value.targetVersion === undefined || typeof value.targetVersion === "string")
  );
}

function isDependencyShape(value: unknown): value is AssetDependency {
  if (!isRecord(value)) return false;
  return typeof value.targetId === "string" && typeof value.dependencyType === "string";
}

/**
 * Structural type guard for data read from outside the layer (for example, an
 * imported JSON file). It checks shape only. Semantic checks belong to AssetValidator.
 */
export function isAssetDefinitionShape(value: unknown): value is AssetDefinition {
  if (!isRecord(value)) return false;
  return (
    isMetadataShape(value.metadata) &&
    typeof value.schemaId === "string" &&
    isAssetStatus(value.status) &&
    isJsonObject(value.properties) &&
    Array.isArray(value.references) &&
    value.references.every(isReferenceShape) &&
    Array.isArray(value.dependencies) &&
    value.dependencies.every(isDependencyShape) &&
    isJsonObject(value.customData)
  );
}

function timestampIssues(value: unknown, path: string): IssueDraft[] {
  const valid =
    typeof value === "string" &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value));
  return valid ? [] : [errorDraft("INVALID_TIMESTAMP", path, `${path} must be a UTC ISO-8601 timestamp.`)];
}

/** Presence and format checks for metadata. */
function metadataIssues(meta: AssetMetadata): IssueDraft[] {
  const issues: IssueDraft[] = [];
  issues.push(...requiredTextIssue(meta.id, "metadata.id"));
  issues.push(...requiredTextIssue(meta.name, "metadata.name"));
  if (typeof meta.id === "string" && meta.id !== "" && !ASSET_ID_PATTERN.test(meta.id)) {
    issues.push(errorDraft("INVALID_ASSET_ID", "metadata.id", `Asset id "${meta.id}" is not a valid identifier.`));
  }
  if (typeof meta.version !== "string" || !SEMVER_PATTERN.test(meta.version)) {
    issues.push(errorDraft("INVALID_VERSION", "metadata.version", `Version "${String(meta.version)}" must be MAJOR.MINOR.PATCH.`));
  }
  if (!isAssetCategory(meta.category)) {
    issues.push(errorDraft("INVALID_CATEGORY", "metadata.category", `Unknown category "${String(meta.category)}".`));
  }
  if (typeof meta.description !== "string") {
    issues.push(errorDraft("MISSING_REQUIRED_FIELD", "metadata.description", "metadata.description must be a string."));
  }
  if (!Array.isArray(meta.tags) || meta.tags.some((tag) => typeof tag !== "string" || tag.trim() === "")) {
    issues.push(errorDraft("INVALID_TAG", "metadata.tags", "Tags must be non-empty strings."));
  }
  if (!isAuthoringSource(meta.authoringSource)) {
    issues.push(errorDraft("INVALID_AUTHORING_SOURCE", "metadata.authoringSource", "Authoring source is not recognized."));
  }
  issues.push(...timestampIssues(meta.createdAt, "metadata.createdAt"));
  issues.push(...timestampIssues(meta.updatedAt, "metadata.updatedAt"));
  return issues;
}

/** Presence and format checks for the non-metadata fields of a definition. */
function envelopeIssues(definition: AssetDefinition): IssueDraft[] {
  const issues: IssueDraft[] = [];
  issues.push(...requiredTextIssue(definition.schemaId, "schemaId"));
  if (typeof definition.schemaId === "string" && definition.schemaId !== "" && !ASSET_ID_PATTERN.test(definition.schemaId)) {
    issues.push(errorDraft("INVALID_SCHEMA_ID", "schemaId", `Schema id "${definition.schemaId}" is invalid.`));
  }
  if (!isAssetStatus(definition.status)) {
    issues.push(errorDraft("INVALID_STATUS", "status", "Status is not recognized."));
  }
  if (!isJsonObject(definition.properties)) {
    issues.push(errorDraft("INVALID_PROPERTIES", "properties", "Properties must be a JSON object."));
  }
  if (!isJsonObject(definition.customData)) {
    issues.push(errorDraft("INVALID_CUSTOM_DATA", "customData", "customData must be a JSON object."));
  }
  return issues;
}

/**
 * Structural checks on a definition's own fields: metadata presence and format,
 * schema id, status, and JSON-object containers. Cross-asset and schema checks
 * live in AssetValidator.
 */
export function validateDefinitionShape(definition: AssetDefinition): IssueDraft[] {
  return [...metadataIssues(definition.metadata), ...envelopeIssues(definition)];
}
