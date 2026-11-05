/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationEvents.ts is an independent, typed publish/subscribe channel used
 * by the pipeline to broadcast lifecycle events. It is deliberately separate
 * from the authoring foundation event bus so the generator remains a self-
 * contained module with no cross-module dependency.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/**
 * Map of event names to their payload shapes. Extending this map is the only
 * way to add new strongly-typed events.
 */
export interface GenerationEventMap {
  /** Fired immediately before a backend begins generating. */
  'generation:started': { readonly requestId: string; readonly schemaId: string; readonly backendName: string };
  /** Fired when a backend reports incremental progress (0..1). */
  'generation:progress': { readonly requestId: string; readonly progress: number; readonly message?: string };
  /** Fired after a successful generation. */
  'generation:completed': { readonly requestId: string; readonly backendName: string; readonly fileCount: number; readonly durationMs: number };
  /** Fired when generation fails with an error. */
  'generation:failed': { readonly requestId: string; readonly backendName?: string; readonly error: string };
  /** Fired when generation is cancelled via the cancellation token. */
  'generation:cancelled': { readonly requestId: string; readonly reason?: string };
}

/** Any valid event name known to the bus. */
export type GenerationEventName = keyof GenerationEventMap;

/** Handler signature for a specific event. */
export type GenerationEventHandler<E extends GenerationEventName> = (
  payload: GenerationEventMap[E],
) => void;

/**
 * A minimal, dependency-free typed event bus.
 * Composition-friendly: instantiate and hold a reference.
 */
export class GenerationEventBus {
  private readonly handlers = new Map<GenerationEventName, Set<(payload: unknown) => void>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<E extends GenerationEventName>(event: E, handler: GenerationEventHandler<E>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: unknown) => void);
    return () => this.off(event, handler);
  }

  /** Remove a previously registered handler. */
  off<E extends GenerationEventName>(event: E, handler: GenerationEventHandler<E>): void {
    this.handlers.get(event)?.delete(handler as (payload: unknown) => void);
  }

  /** Dispatch an event to every subscriber. Handlers are invoked in order. */
  emit<E extends GenerationEventName>(event: E, payload: GenerationEventMap[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) handler(payload as unknown);
  }

  /** Remove every subscription. */
  clear(): void {
    this.handlers.clear();
  }
}
