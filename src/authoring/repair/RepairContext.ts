/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairContext.ts carries immutable, read-only information into repair
 * planners, policies, and validators: project/toolchain versions, repair mode,
 * safety boundary paths (allowed and protected), and free-form metadata.
 *
 * It holds no reference to the engine, gameplay, UI, or rendering — only
 * structural policy information is stored. No filesystem checking is performed.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** How permissive repair planning and validation should be. */
export type RepairMode = 'safe' | 'standard' | 'aggressive';

/** Immutable context handed to repair planners, policies, and validators. */
export interface RepairContext {
  /** Version of the project being authored and checked. */
  readonly projectVersion: string;
  /** Version of the authoring toolchain performing repair planning. */
  readonly authoringVersion: string;
  /** Permissiveness mode for repair planning and safety rules. */
  readonly repairMode: RepairMode;
  /** Glob or prefix patterns identifying paths where repairs are permitted. */
  readonly allowedPaths: readonly string[];
  /** Glob or prefix patterns identifying paths where repairs are strictly forbidden. */
  readonly protectedPaths: readonly string[];
  /** Free-form, serializable metadata supplied by the caller. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

/** Options accepted by {@link createRepairContext}. */
export interface RepairContextOptions {
  projectVersion?: string;
  authoringVersion?: string;
  repairMode?: RepairMode;
  allowedPaths?: readonly string[];
  protectedPaths?: readonly string[];
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Default safety boundary paths for the PRESERVE authoring toolchain.
 * Authoring code is permitted to be repaired; runtime/engine/game/ui code is protected.
 */
export const DEFAULT_ALLOWED_PATHS: readonly string[] = [
  'src/authoring/',
  'src/authoring/*',
];

export const DEFAULT_PROTECTED_PATHS: readonly string[] = [
  'src/engine/',
  'src/engine/*',
  'src/runtime/',
  'src/runtime/*',
  'src/game/',
  'src/game/*',
  'src/ui/',
  'src/ui/*',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
];

/** Default context matching the PRESERVE safety model. */
export const DEFAULT_REPAIR_CONTEXT: Readonly<RepairContext> = {
  projectVersion: '0.0.0',
  authoringVersion: '1.0.0',
  repairMode: 'standard',
  allowedPaths: DEFAULT_ALLOWED_PATHS,
  protectedPaths: DEFAULT_PROTECTED_PATHS,
  metadata: {},
};

/**
 * Build an immutable {@link RepairContext}.
 * The returned object is plain data and safe to serialize.
 */
export function createRepairContext(
  options: RepairContextOptions = {},
): RepairContext {
  return {
    projectVersion: options.projectVersion ?? DEFAULT_REPAIR_CONTEXT.projectVersion,
    authoringVersion: options.authoringVersion ?? DEFAULT_REPAIR_CONTEXT.authoringVersion,
    repairMode: options.repairMode ?? DEFAULT_REPAIR_CONTEXT.repairMode,
    allowedPaths: options.allowedPaths ? [...options.allowedPaths] : [...DEFAULT_ALLOWED_PATHS],
    protectedPaths: options.protectedPaths ? [...options.protectedPaths] : [...DEFAULT_PROTECTED_PATHS],
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/**
 * Return a copy of `context` with the supplied changes applied.
 * The original context is never mutated.
 */
export function withRepairContextChanges(
  context: RepairContext,
  changes: RepairContextOptions,
): RepairContext {
  return {
    projectVersion: changes.projectVersion ?? context.projectVersion,
    authoringVersion: changes.authoringVersion ?? context.authoringVersion,
    repairMode: changes.repairMode ?? context.repairMode,
    allowedPaths: changes.allowedPaths ? [...changes.allowedPaths] : [...context.allowedPaths],
    protectedPaths: changes.protectedPaths ? [...changes.protectedPaths] : [...context.protectedPaths],
    metadata: changes.metadata ? { ...context.metadata, ...changes.metadata } : context.metadata,
  };
}
