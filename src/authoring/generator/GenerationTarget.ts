/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationTarget.ts describes the destination of a generation job. Only the
 * `memory` target is implemented in this phase; the remaining kinds are
 * declared so that future backends and future modules can express intent
 * without modifying this file when a new destination is added.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Every kind of destination the pipeline is designed to support. */
export type GenerationTargetKind = 'memory' | 'virtual' | 'filesystem' | 'network' | 'cloud';

/**
 * A serializable descriptor pointing at one output destination.
 * `options` is intentionally opaque so future kinds can attach configuration
 * without changing this file.
 */
export interface GenerationTargetDescriptor {
  readonly kind: GenerationTargetKind;
  readonly label?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/** Build a descriptor pointing at in-memory output. This is the only kind
 * implemented in this phase and is the safe default for every request. */
export function createMemoryTarget(
  label?: string,
  options?: Record<string, unknown>,
): GenerationTargetDescriptor {
  return {
    kind: 'memory',
    label,
    options: options ? { ...options } : undefined,
  };
}

/** Whether a target kind can currently be dispatched to. */
export function isTargetImplemented(kind: GenerationTargetKind): boolean {
  return kind === 'memory';
}

/**
 * Throw if a target kind is not yet implemented.
 * The pipeline calls this before invoking a backend so unimplemented kinds are
 * rejected with a clear message rather than surfacing as backend errors.
 */
export function ensureTargetImplemented(kind: GenerationTargetKind): void {
  if (!isTargetImplemented(kind)) {
    throw new Error(`Generation target "${kind}" is not implemented in this phase.`);
  }
}

/** Human-readable rendering of a descriptor for logs and reports. */
export function describeTarget(descriptor: GenerationTargetDescriptor): string {
  return descriptor.label ? `${descriptor.kind}:${descriptor.label}` : descriptor.kind;
}
