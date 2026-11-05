/**
 * PRESERVE Authoring System — shared type definitions.
 *
 * These types describe the minimal contracts used across the authoring
 * infrastructure. They contain NO runtime logic and are safe to import from
 * any authoring module. Nothing here references the engine, gameplay, or the
 * shipping runtime.
 *
 * The source code always remains the single source of truth; these types only
 * describe how future authoring modules cooperate.
 */

/** Build modes the authoring system can operate under. */
export type AuthoringBuildMode = 'development' | 'production' | 'preview';

/** Supported log severities emitted by the {@link Logger}. */
export type LogLevel = 'info' | 'warning' | 'error' | 'success' | 'debug';

/** Lifecycle states of the central authoring coordinator. */
export type AuthoringLifecycle =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'shutting-down'
  | 'stopped';

/**
 * Read-only view of shared runtime information exposed to authoring modules.
 * Modules receive this during {@link AuthoringModule.initialize} so they can
 * inspect the environment without mutating coordinator internals.
 */
export interface ReadonlyAuthoringContext {
  /** Absolute or relative root of the project being authored. */
  readonly projectRoot: string;
  /** Version string of the engine the authoring session targets. */
  readonly engineVersion: string;
  /** Build mode the authoring session runs under. */
  readonly buildMode: AuthoringBuildMode;
  /** Whether debug behavior is currently enabled. */
  readonly debug: boolean;
  /** Current authoring language (for future localized generation). */
  readonly language: string;
  /** Current authoring theme identifier. */
  readonly theme: string;
  /** Look up a registered module by its unique name. */
  getModule(name: string): AuthoringModule | undefined;
  /** List the names of all currently registered modules. */
  listModules(): readonly string[];
}

/**
 * The contract every authoring feature must implement.
 *
 * Each future feature (Generator, Registry, Validator, Preview, Templates,
 * Blueprint, Exporter, ...) is an independent, composable module implementing
 * this interface. Modules never inherit from one another.
 */
export interface AuthoringModule {
  /** Stable, unique, human-readable module identifier. */
  getName(): string;
  /** Semantic version string for the module. */
  getVersion(): string;
  /** Called once when the module is activated by the coordinator. */
  initialize(context: ReadonlyAuthoringContext): void | Promise<void>;
  /** Called once when the module is deactivated by the coordinator. */
  shutdown(): void | Promise<void>;
}

/**
 * Minimal provider interface that supplies module lookups to the context.
 * The {@link AuthoringSystem} implements this so the context can delegate
 * without depending on the coordinator class directly (composition, not
 * inheritance or circular imports).
 */
export interface ModuleProvider {
  getModule(name: string): AuthoringModule | undefined;
  listModules(): readonly string[];
}

/** Internal bookkeeping record for a registered module. */
export interface ModuleRegistration {
  readonly module: AuthoringModule;
  readonly name: string;
  readonly version: string;
  /** Whether {@link AuthoringModule.initialize} has completed. */
  initialized: boolean;
}

/**
 * Configurable options for the authoring session.
 * Defaults live in a named constant, never hardcoded at usage sites.
 */
export interface AuthoringConfigOptions {
  /** Enable debug behavior across authoring modules. */
  debug: boolean;
  /** Emit verbose (debug-level) log output. */
  verboseLogging: boolean;
  /** Run authoring in a non-mutating preview posture. */
  previewMode: boolean;
  /** Indicate an interactive development session. */
  developmentMode: boolean;
  /** Allow experimental, unstable module behavior. */
  experimentalFeatures: boolean;
}

/** Broad classification of a tracked file. Metadata only. */
export type FileKind = 'source' | 'asset' | 'config' | 'generated' | 'unknown';

/**
 * Metadata describing a single tracked file.
 *
 * The {@link FileRegistry} stores this information only; it never reads from or
 * writes to the actual filesystem.
 */
export interface FileMetadata {
  /** Unique identifier for the entry (defaults to the file path). */
  readonly id: string;
  /** Logical path of the file, as supplied by the registering module. */
  readonly path: string;
  /** Classification of the file. */
  readonly kind: FileKind;
  /** Freeform tags for future filtering. */
  readonly tags: readonly string[];
  /** Epoch milliseconds when the entry was registered. */
  readonly registeredAt: number;
  /** Optional human-readable description. */
  readonly description?: string;
}
