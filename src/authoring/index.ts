/**
 * PRESERVE Authoring System — public entry point.
 *
 * Internal, development-only tooling foundation. This module is intentionally
 * NOT imported by the engine, gameplay, or runtime. Because nothing in the
 * shipping application imports it, tree-shaking excludes the entire authoring
 * module from production bundles. The {@link createAuthoringSystem} factory adds
 * a second safeguard by refusing to instantiate under a production build.
 *
 * The source code always remains the single source of truth. This system only
 * coordinates future modules that automate repetitive development tasks.
 */

// ----- Types -----
export type {
  AuthoringBuildMode,
  AuthoringLifecycle,
  AuthoringModule,
  AuthoringConfigOptions,
  ReadonlyAuthoringContext,
  ModuleProvider,
  ModuleRegistration,
  FileKind,
  FileMetadata,
  LogLevel,
} from './types/AuthoringTypes';

// ----- Core -----
export { AuthoringSystem } from './core/AuthoringSystem';
export type { AuthoringSystemOptions } from './core/AuthoringSystem';
export { AuthoringContext } from './core/AuthoringContext';
export type { AuthoringContextInit } from './core/AuthoringContext';
export { AuthoringConfig, DEFAULT_AUTHORING_CONFIG } from './core/AuthoringConfig';

// ----- Services -----
export { Logger, ConsoleLogSink } from './services/Logger';
export type { LogEntry, LogSink, LoggerOptions } from './services/Logger';
export { FileRegistry } from './services/FileRegistry';
export type { FileRegistrationInput } from './services/FileRegistry';

// ----- Events -----
export { AuthoringEventBus } from './events/AuthoringEvents';
export type {
  AuthoringEventMap,
  AuthoringEventName,
  AuthoringEventHandler,
} from './events/AuthoringEvents';

import { AuthoringSystem, type AuthoringSystemOptions } from './core/AuthoringSystem';
import type { AuthoringBuildMode } from './types/AuthoringTypes';

/** Subset of the bundler-provided environment that we read defensively. */
interface BundlerEnv {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
}

/** Safely read the bundler environment without assuming it exists. */
function readEnv(): BundlerEnv {
  try {
    return (import.meta as unknown as { env?: BundlerEnv }).env ?? {};
  } catch {
    return {};
  }
}

/** Resolve the current build mode from the bundler environment. */
export function resolveBuildMode(): AuthoringBuildMode {
  const env = readEnv();
  if (env.PROD) return 'production';
  if (env.MODE === 'preview') return 'preview';
  return 'development';
}

/** True when authoring tooling is permitted to run (never in production). */
export function isAuthoringAvailable(): boolean {
  return resolveBuildMode() !== 'production';
}

/**
 * Factory for a preconfigured {@link AuthoringSystem}.
 * Returns `undefined` in production builds so authoring never runs in shipping
 * code, even if this factory were reached accidentally.
 */
export function createAuthoringSystem(
  options: AuthoringSystemOptions = {},
): AuthoringSystem | undefined {
  if (!isAuthoringAvailable()) return undefined;
  return new AuthoringSystem({ buildMode: resolveBuildMode(), ...options });
}
