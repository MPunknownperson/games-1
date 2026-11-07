/**
 * Shared, JSON-serializable types and small pure helpers for the Asset Definition layer.
 *
 * This file describes content *structure* only. It contains no gameplay logic,
 * no runtime imports, and no I/O. Every value here must round-trip through JSON.
 */

/** Content categories an asset may belong to. */
export const ASSET_CATEGORIES = [
  "CHARACTER",
  "ENEMY",
  "NPC",
  "ITEM",
  "WEAPON",
  "ARMOR",
  "SKILL",
  "QUEST",
  "DIALOGUE",
  "LEVEL",
  "WORLD",
  "ENVIRONMENT",
  "EFFECT",
  "AUDIO",
  "UI_ELEMENT",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** Lifecycle status of an asset definition. */
export const ASSET_STATUSES = ["DRAFT", "VALID", "INVALID", "DEPRECATED"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** Where an asset definition originated. Recorded only; no generation is performed here. */
export const AUTHORING_SOURCES = ["MANUAL", "IMPORTED", "SYSTEM", "UNKNOWN"] as const;

export type AuthoringSource = (typeof AUTHORING_SOURCES)[number];

/** Strict JSON value model (no undefined, no functions, no NaN/Infinity by convention). */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Asset and schema identifiers: lowercase, digits, underscore, hyphen. */
export const ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Semantic version in MAJOR.MINOR.PATCH form. */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** UTC ISO-8601 timestamp, e.g. 2026-01-31T12:00:00Z. Timestamps are supplied by callers. */
export const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Machine-readable type label for references and dependencies, e.g. "skill", "animation". */
export const TYPE_LABEL_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export interface AssetMetadata {
  id: string;
  name: string;
  version: string;
  category: AssetCategory;
  description: string;
  tags: string[];
  authoringSource: AuthoringSource;
  createdAt: string;
  updatedAt: string;
}

export type ValidationSeverity = "ERROR" | "WARNING";

/** A single structural finding. `assetId` is "schema:<id>" for schema-level findings. */
export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  assetId: string;
  path: string;
  message: string;
}

/** An issue before the owning asset id has been attached. */
export type IssueDraft = Omit<ValidationIssue, "assetId">;

export function errorDraft(code: string, path: string, message: string): IssueDraft {
  return { code, severity: "ERROR", path, message };
}

export function warningDraft(code: string, path: string, message: string): IssueDraft {
  return { code, severity: "WARNING", path, message };
}

/** Returns a MISSING_REQUIRED_FIELD issue when the value is not a non-empty string. */
export function requiredTextIssue(value: unknown, path: string): IssueDraft[] {
  if (typeof value === "string" && value.trim() !== "") return [];
  return [errorDraft("MISSING_REQUIRED_FIELD", path, `${path} is required.`)];
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return true;
  if (kind === "number") return Number.isFinite(value as number);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (kind === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value)
  );
}

/** Deep copy through JSON. Drops anything that is not JSON-representable. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Locale-independent string comparison, so ordering is identical on every machine. */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Values that appear more than once, sorted. Each duplicate is listed once. */
export function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareStrings);
}

/** Unique values, sorted. Returns a new array. */
export function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort(compareStrings);
}

/** A RegExp built from a pattern string, or null if the pattern does not compile. */
export function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === "string" && (ASSET_CATEGORIES as readonly string[]).includes(value);
}

export function isAssetStatus(value: unknown): value is AssetStatus {
  return typeof value === "string" && (ASSET_STATUSES as readonly string[]).includes(value);
}

export function isAuthoringSource(value: unknown): value is AuthoringSource {
  return typeof value === "string" && (AUTHORING_SOURCES as readonly string[]).includes(value);
}
