/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationSession.ts tracks the lifecycle of a single generation job:
 * the request being handled, start/finish timestamps, progress, cancellation,
 * and status. The session also owns the cancellation token consumed by
 * backends via the {@link GenerationContext}.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { GenerationRequest } from './GenerationRequest';

/** Coarse lifecycle status of a session. */
export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Cooperative cancellation token.
 * Backends check `isCancelled()` at safe points or call `throwIfCancelled()`
 * to abort with a {@link CancellationError}.
 */
export interface CancellationToken {
  isCancelled(): boolean;
  cancel(reason?: string): void;
  reason(): string | undefined;
  throwIfCancelled(): void;
}

/** Error raised by {@link CancellationToken.throwIfCancelled}. */
export class CancellationError extends Error {
  readonly reasonText?: string;
  constructor(reason?: string) {
    super(reason ? `Cancelled: ${reason}` : 'Cancelled');
    this.name = 'CancellationError';
    this.reasonText = reason;
  }
}

/** Build a fresh cancellation token with private mutable state. */
export function createCancellationToken(): CancellationToken {
  let cancelled = false;
  let reasonText: string | undefined;
  return {
    isCancelled: () => cancelled,
    cancel: (reason?: string) => {
      cancelled = true;
      reasonText = reason;
    },
    reason: () => reasonText,
    throwIfCancelled: () => {
      if (cancelled) throw new CancellationError(reasonText);
    },
  };
}

/** Snapshot of session timing and progress. */
export interface SessionStatisticsSnapshot {
  readonly progress: number;
  readonly startedAtMs?: number;
  readonly finishedAtMs?: number;
  readonly durationMs: number;
  readonly status: SessionStatus;
}

/**
 * Tracks one generation job. Composition-friendly: each dispatch creates its
 * own instance and holds no global state.
 */
export class GenerationSession {
  private readonly request: GenerationRequest;
  private readonly cancellation: CancellationToken;
  private status: SessionStatus = 'idle';
  private progress = 0;
  private startedAtMs?: number;
  private finishedAtMs?: number;

  constructor(request: GenerationRequest, token?: CancellationToken) {
    this.request = request;
    this.cancellation = token ?? createCancellationToken();
  }

  /** The request being executed. */
  getRequest(): GenerationRequest {
    return this.request;
  }

  /** The token consumed by backends for cooperative cancellation. */
  getCancellationToken(): CancellationToken {
    return this.cancellation;
  }

  /** Current lifecycle status. */
  getStatus(): SessionStatus {
    return this.status;
  }

  /** Latest reported progress in the inclusive range 0..1. */
  getProgress(): number {
    return this.progress;
  }

  /** Wall-clock milliseconds elapsed since start (0 when not yet started). */
  getDurationMs(): number {
    if (this.startedAtMs === undefined) return 0;
    const end = this.finishedAtMs ?? nowMs();
    return end - this.startedAtMs;
  }

  /** Mark the session running. Idempotent. */
  start(): void {
    if (this.status !== 'idle') return;
    this.status = 'running';
    this.progress = 0;
    this.startedAtMs = nowMs();
  }

  /** Update the current progress fraction; clamped to 0..1. */
  reportProgress(pct: number): void {
    if (this.status !== 'running') return;
    this.progress = pct < 0 ? 0 : pct > 1 ? 1 : pct;
  }

  /** Mark the session successfully completed. */
  complete(): void {
    if (this.status !== 'running') return;
    this.status = 'completed';
    this.progress = 1;
    this.finishedAtMs = nowMs();
  }

  /** Mark the session failed. */
  fail(): void {
    if (this.isTerminal()) return;
    this.status = 'failed';
    this.finishedAtMs = nowMs();
  }

  /** Cancel the session; sets the token and marks status. */
  cancel(reason?: string): void {
    if (this.isTerminal()) return;
    this.cancellation.cancel(reason);
    this.status = 'cancelled';
    this.finishedAtMs = nowMs();
  }

  /** Whether cancellation has been requested. */
  isCancelled(): boolean {
    return this.cancellation.isCancelled();
  }

  /** Immutable snapshot of session timing and progress. */
  snapshot(): SessionStatisticsSnapshot {
    return {
      progress: this.progress,
      startedAtMs: this.startedAtMs,
      finishedAtMs: this.finishedAtMs,
      durationMs: this.getDurationMs(),
      status: this.status,
    };
  }

  private isTerminal(): boolean {
    return this.status === 'completed' || this.status === 'failed' || this.status === 'cancelled';
  }
}

/** High-resolution timestamp with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
