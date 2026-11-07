/**
 * Deterministic JSON serialization for asset definitions.
 *
 * - Works on strings only. No filesystem, network, or process access.
 * - Object keys are sorted recursively. Assets are sorted by id. Arrays keep their order.
 * - Import checks the envelope and shape only. Semantic checks belong to AssetValidator.
 * - Imports only the CURRENT format version. Older versions must go through an
 *   explicit migration plan (see AssetMigration); they are never rewritten here.
 */
import { compareStrings, findDuplicates, type JsonValue } from "./AssetTypes";
import { cloneDefinition, isAssetDefinitionShape, type AssetDefinition } from "./AssetDefinition";
import { checkCompatibility, CURRENT_FORMAT_VERSION } from "./AssetMigration";

export const ASSET_FORMAT_NAME = "preserve.asset-definitions";

export interface AssetEnvelope {
  format: string;
  formatVersion: string;
  assets: AssetDefinition[];
}

export type ParseResult =
  | { ok: true; definitions: AssetDefinition[] }
  | { ok: false; errors: string[] };

/** Returns a copy with object keys sorted recursively. undefined and functions become null. */
export function canonicalize(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record).sort(compareStrings)) {
      if (record[key] !== undefined) out[key] = canonicalize(record[key]);
    }
    return out;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return null;
}

function sortById(definitions: AssetDefinition[]): AssetDefinition[] {
  return [...definitions].sort((a, b) => compareStrings(a.metadata.id, b.metadata.id));
}

/** Canonical JSON for one asset, with a trailing newline. */
export function serializeAsset(definition: AssetDefinition): string {
  return `${JSON.stringify(canonicalize(definition), null, 2)}\n`;
}

/** Canonical JSON envelope for a set of assets. Output is identical for identical input. */
export function serializeAssets(definitions: AssetDefinition[]): string {
  const envelope: AssetEnvelope = {
    format: ASSET_FORMAT_NAME,
    formatVersion: CURRENT_FORMAT_VERSION,
    assets: sortById(definitions),
  };
  return `${JSON.stringify(canonicalize(envelope), null, 2)}\n`;
}

function envelopeErrors(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["Root must be a JSON object."];
  }
  const envelope = raw as Record<string, unknown>;
  if (envelope.format !== ASSET_FORMAT_NAME) {
    return [`Unexpected format "${String(envelope.format)}".`];
  }
  if (typeof envelope.formatVersion !== "string") {
    return ["formatVersion must be a string."];
  }
  const compatibility = checkCompatibility(envelope.formatVersion, CURRENT_FORMAT_VERSION);
  if (compatibility.status !== "CURRENT") {
    return [`Format version ${envelope.formatVersion} cannot be imported directly: ${compatibility.reason}`];
  }
  if (!Array.isArray(envelope.assets)) {
    return ["assets must be an array."];
  }
  return envelope.assets.flatMap((item, i) =>
    isAssetDefinitionShape(item) ? [] : [`assets[${i}] does not match the asset definition shape.`],
  );
}

function duplicateErrors(definitions: AssetDefinition[]): string[] {
  return findDuplicates(definitions.map((d) => d.metadata.id)).map(
    (id) => `Duplicate asset id "${id}" in import.`,
  );
}

/** Parses a canonical envelope. Returns errors instead of throwing. */
export function parseAssets(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { ok: false, errors: [`Invalid JSON: ${message}`] };
  }
  const errors = envelopeErrors(raw);
  if (errors.length > 0) return { ok: false, errors };

  const assets = (raw as AssetEnvelope).assets;
  const duplicates = duplicateErrors(assets);
  if (duplicates.length > 0) return { ok: false, errors: duplicates };
  return { ok: true, definitions: sortById(assets.map((a) => cloneDefinition(a))) };
}

/** FNV-1a 32-bit hash of the canonical JSON. Stable across runs. Not cryptographic. */
export function fingerprintAsset(definition: AssetDefinition): string {
  const text = JSON.stringify(canonicalize(definition));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
