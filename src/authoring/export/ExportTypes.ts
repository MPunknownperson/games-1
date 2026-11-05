/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportTypes.ts declares the shared vocabulary used across the export layer:
 * formats, targets, statuses, modes, metadata bags, and configuration options.
 * Every type is plain data and JSON-serializable.
 *
 * The export layer *describes* packages — it never publishes, deploys,
 * uploads, or writes to disk. It has no knowledge of towers, enemies, weapons,
 * damage, health, levels, themes, balancing, or UI.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Serialization format used to represent an export package or entry. */
export const ExportFormat = {
  /** Structured JSON representation. */
  JSON: 'JSON',
  /** Plain-text manifest listing. */
  TEXT: 'TEXT',
  /** Line-oriented, machine-readable summary. */
  SUMMARY: 'SUMMARY',
  /** Source text carried verbatim from a generation backend. */
  SOURCE: 'SOURCE',
} as const;

/** Union of every supported export format. */
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

/**
 * Destination description for an export package.
 * Only `MEMORY` is implemented; the remaining values exist so callers can
 * express intent without this file changing when a destination is added.
 */
export const ExportTarget = {
  /** In-memory structures returned to the caller. The only implemented target. */
  MEMORY: 'MEMORY',
  /** A virtual, non-persistent output space. Declared, not implemented. */
  VIRTUAL: 'VIRTUAL',
  /** An external consumer supplied by a future module. Declared, not implemented. */
  EXTERNAL: 'EXTERNAL',
} as const;

/** Union of every declared export target. */
export type ExportTarget = (typeof ExportTarget)[keyof typeof ExportTarget];

/** Lifecycle state of an export operation or session. */
export const ExportStatus = {
  CREATED: 'CREATED',
  PREPARING: 'PREPARING',
  VALIDATING: 'VALIDATING',
  EXPORTING: 'EXPORTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

/** Union of every supported status. */
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

/** How thorough an export operation should be. */
export const ExportMode = {
  /** Describe the package without producing serialized output. */
  DESCRIBE: 'DESCRIBE',
  /** Produce the full serialized package representation. */
  FULL: 'FULL',
  /** Produce only the manifest, omitting entry payload descriptions. */
  MANIFEST_ONLY: 'MANIFEST_ONLY',
} as const;

/** Union of every supported mode. */
export type ExportMode = (typeof ExportMode)[keyof typeof ExportMode];

/** Category classification for an exported entry. */
export const ExportCategory = {
  SCHEMA: 'SCHEMA',
  SOURCE: 'SOURCE',
  PREVIEW: 'PREVIEW',
  VALIDATION: 'VALIDATION',
  MANIFEST: 'MANIFEST',
  DOCUMENT: 'DOCUMENT',
  OTHER: 'OTHER',
} as const;

/** Union of every supported entry category. */
export type ExportCategory = (typeof ExportCategory)[keyof typeof ExportCategory];

/** Semantic version expressed as structured, serializable data. */
export interface ExportVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** Authorship details recorded on a package manifest. */
export interface ExportAuthor {
  /** Person or system credited with producing the package. */
  readonly name: string;
  /** Optional contact or attribution reference. */
  readonly contact?: string;
  /** Optional organisation or team name. */
  readonly organisation?: string;
}

/** A declared dependency of an export package. */
export interface ExportDependency {
  /** Identifier of the depended-upon package or schema. */
  readonly id: string;
  /** Minimum acceptable version, when constrained. */
  readonly minimumVersion?: ExportVersion;
  /** When true, the dependency is advisory rather than mandatory. */
  readonly optional?: boolean;
}

/** Compatibility window declared by a package. */
export interface ExportCompatibility {
  /** Lowest toolchain version known to work with this package. */
  readonly minimumToolchainVersion?: ExportVersion;
  /** Highest toolchain version known to work with this package. */
  readonly maximumToolchainVersion?: ExportVersion;
  /** Free-form compatibility notes. */
  readonly notes?: string;
}

/** Descriptive metadata attached to a package or entry. */
export interface ExportMetadata {
  /** Human-facing label. */
  readonly label?: string;
  /** Longer explanation of what is being exported. */
  readonly description?: string;
  /** Tags used for grouping and lookup. */
  readonly tags?: readonly string[];
  /** Free-form, serializable key-value pairs. */
  readonly properties?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Options controlling how an export package is assembled. */
export interface ExportOptions {
  /** Serialization format for the produced output. Defaults to `JSON`. */
  readonly format?: ExportFormat;
  /** Destination description. Defaults to `MEMORY`. */
  readonly target?: ExportTarget;
  /** How thorough the operation should be. Defaults to `FULL`. */
  readonly mode?: ExportMode;
  /** Fixed ISO-8601 timestamp, making output byte-stable. */
  readonly timestamp?: string;
  /** Sort entries by identifier for deterministic ordering. Defaults to true. */
  readonly sorted?: boolean;
  /** Pretty-print serialized output. Defaults to true. */
  readonly pretty?: boolean;
}

/** Default option values applied when a caller omits them. */
export const DEFAULT_EXPORT_OPTIONS: Readonly<Required<Omit<ExportOptions, 'timestamp'>>> = {
  format: ExportFormat.JSON,
  target: ExportTarget.MEMORY,
  mode: ExportMode.FULL,
  sorted: true,
  pretty: true,
};

/** Format a version as the canonical `major.minor.patch` string. */
export function formatExportVersion(version: ExportVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Build a version from numeric components, clamping to non-negative integers. */
export function createExportVersion(major = 1, minor = 0, patch = 0): ExportVersion {
  const clamp = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return { major: clamp(major), minor: clamp(minor), patch: clamp(patch) };
}
