/**
 * PRESERVE Authoring System — lightweight typed event bus.
 *
 * Provides a minimal publish/subscribe channel used by the coordinator to
 * broadcast lifecycle events. Modules may listen for future coordination.
 * No runtime, gameplay, or engine code depends on this file.
 */
import type { LogLevel } from '../types/AuthoringTypes';

/**
 * Map of event names to their payload shapes.
 * Extending this map is the only way to add new strongly-typed events.
 */
export interface AuthoringEventMap {
  /** Emitted once the coordinator finishes initializing all modules. */
  'system:initialized': { moduleCount: number };
  /** Emitted once the coordinator has shut down all modules. */
  'system:shutdown': { reason?: string };
  /** Emitted when a module is registered (before initialization). */
  'module:registered': { name: string; version: string };
  /** Emitted after a module has been initialized. */
  'module:initialized': { name: string };
  /** Emitted after a module has been shut down. */
  'module:shutdown': { name: string };
  /** Emitted for observable log lines (future log routing). */
  'log': { level: LogLevel; message: string; timestamp: number };
}

/** Any valid event name known to the bus. */
export type AuthoringEventName = keyof AuthoringEventMap;

/** Handler signature for a specific event. */
export type AuthoringEventHandler<E extends AuthoringEventName> = (
  payload: AuthoringEventMap[E],
) => void;

/**
 * A minimal, dependency-free typed event bus.
 * Composition-friendly: instantiate and hold a reference; no inheritance.
 */
export class AuthoringEventBus {
  private readonly handlers = new Map<AuthoringEventName, Set<(payload: unknown) => void>>();

  /**
   * Subscribe to an event.
   * @returns an unsubscribe function that removes the handler.
   */
  on<E extends AuthoringEventName>(event: E, handler: AuthoringEventHandler<E>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: unknown) => void);
    return () => this.off(event, handler);
  }

  /** Remove a previously registered handler. */
  off<E extends AuthoringEventName>(event: E, handler: AuthoringEventHandler<E>): void {
    this.handlers.get(event)?.delete(handler as (payload: unknown) => void);
  }

  /** Dispatch an event to all subscribers. */
  emit<E extends AuthoringEventName>(event: E, payload: AuthoringEventMap[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) handler(payload as unknown);
  }

  /** Remove every subscription. */
  clear(): void {
    this.handlers.clear();
  }
}
