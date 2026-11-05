/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationPipeline.ts is the central coordinator. Its responsibilities are
 * strictly limited to: validating requests, locating the appropriate backend,
 * invoking it, collecting output, reporting progress, and translating outcomes
 * into structured results. It knows nothing about gameplay, towers, enemies,
 * or themes — it only orchestrates work.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  assertBackendShape,
  toBackendRegistration,
  type BackendRegistration,
  type GenerationBackend,
} from './GenerationBackend';
import {
  DEFAULT_GENERATION_CONFIG,
  createGenerationContext,
  type GenerationConfig,
  type GenerationContext,
} from './GenerationContext';
import { GenerationEventBus } from './GenerationEvents';
import { GenerationLogger } from './GenerationLogger';
import { validateRequestShape, type GenerationRequest } from './GenerationRequest';
import {
  createCancelledResult,
  createFailureResult,
  createSuccessResult,
  type GenerationResult,
} from './GenerationResult';
import { CancellationError, GenerationSession } from './GenerationSession';
import { ensureTargetImplemented } from './GenerationTarget';
import { GenerationWriter } from './GenerationWriter';

/** Construction options for {@link GenerationPipeline}. */
export interface PipelineOptions {
  config?: Partial<GenerationConfig>;
  logger?: GenerationLogger;
  events?: GenerationEventBus;
}

/**
 * Coordinator that manages backends and dispatches requests.
 * Composition-based: it holds its collaborators rather than inheriting.
 */
export class GenerationPipeline {
  private readonly backends = new Map<string, BackendRegistration>();
  private readonly events: GenerationEventBus;
  private readonly logger: GenerationLogger;
  private readonly config: GenerationConfig;

  constructor(options: PipelineOptions = {}) {
    this.config = { ...DEFAULT_GENERATION_CONFIG, ...options.config };
    this.logger = options.logger ?? new GenerationLogger({ verbose: this.config.verbose });
    this.events = options.events ?? new GenerationEventBus();
  }

  /** Register a backend. Throws on duplicate name or invalid shape. */
  registerBackend(backend: GenerationBackend): void {
    assertBackendShape(backend);
    const name = backend.getName();
    if (this.backends.has(name)) {
      throw new Error(`Generation backend "${name}" is already registered.`);
    }
    this.backends.set(name, toBackendRegistration(backend));
    this.logger.info('pipeline', `Registered backend "${name}" v${backend.getVersion()}`);
  }

  /** Remove a backend by name. Returns true when an entry was removed. */
  unregisterBackend(name: string): boolean {
    return this.backends.delete(name);
  }

  /** Names of every registered backend in registration order. */
  listBackends(): readonly string[] {
    return Array.from(this.backends.keys());
  }

  /** Look up a backend by name. */
  getBackend(name: string): GenerationBackend | undefined {
    return this.backends.get(name)?.backend;
  }

  /** Access the pipeline event bus. */
  getEvents(): GenerationEventBus {
    return this.events;
  }

  /** Access the pipeline logger. */
  getLogger(): GenerationLogger {
    return this.logger;
  }

  /** Immutable copy of the pipeline configuration. */
  getConfig(): Readonly<GenerationConfig> {
    return { ...this.config };
  }

  /** Initialize every registered backend that has not been initialized yet. */
  async initialize(): Promise<void> {
    for (const registration of this.backends.values()) {
      if (registration.initialized) continue;
      await registration.backend.initialize();
      registration.initialized = true;
    }
  }

  /** Shut down every initialized backend in reverse registration order. */
  async shutdown(): Promise<void> {
    for (const registration of Array.from(this.backends.values()).reverse()) {
      if (!registration.initialized) continue;
      await registration.backend.shutdown();
      registration.initialized = false;
    }
  }

  /**
   * Coordinate one generation job end-to-end.
   * Always resolves with a {@link GenerationResult}; failures do not throw.
   */
  async dispatch(request: GenerationRequest): Promise<GenerationResult> {
    const startedAtMs = nowMs();
    const shape = validateRequestShape(request);
    if (!shape.valid) {
      return this.emitFailure(request, undefined, shape.errors.join('; '), startedAtMs);
    }
    try {
      ensureTargetImplemented(request.target.kind);
    } catch (error) {
      return this.emitFailure(request, undefined, (error as Error).message, startedAtMs);
    }
    const registration = this.locateBackend(request);
    if (!registration) {
      const message = `No registered backend supports request "${request.requestId}".`;
      return this.emitFailure(request, undefined, message, startedAtMs);
    }
    return this.executeGeneration(request, registration, startedAtMs);
  }

  /** Build and run a session/context, then translate the outcome. */
  private async executeGeneration(
    request: GenerationRequest,
    registration: BackendRegistration,
    startedAtMs: number,
  ): Promise<GenerationResult> {
    const session = new GenerationSession(request);
    const writer = new GenerationWriter();
    const context = this.buildContext(session, registration.backend, request.requestId);
    this.events.emit('generation:started', {
      requestId: request.requestId,
      schemaId: request.schemaId,
      backendName: registration.name,
    });
    session.start();
    try {
      if (!registration.initialized) {
        await registration.backend.initialize();
        registration.initialized = true;
      }
      await registration.backend.generate(request, writer, context);
      return this.finishGeneration(session, request, registration, writer, startedAtMs);
    } catch (error) {
      return this.handleGenerationError(error, session, request, registration, writer, startedAtMs);
    }
  }

  /** Construct the runtime context handed to a backend. */
  private buildContext(
    session: GenerationSession,
    backend: GenerationBackend,
    requestId: string,
  ): GenerationContext {
    return createGenerationContext({
      session,
      backend,
      logger: this.logger,
      config: this.config,
      onProgress: (progress, message) =>
        this.events.emit('generation:progress', { requestId, progress, message }),
    });
  }

  /** Post-generation success or in-flight cancellation. */
  private finishGeneration(
    session: GenerationSession,
    request: GenerationRequest,
    registration: BackendRegistration,
    writer: GenerationWriter,
    startedAtMs: number,
  ): GenerationResult {
    const durationMs = nowMs() - startedAtMs;
    if (session.isCancelled()) {
      const reason = session.getCancellationToken().reason();
      session.cancel(reason);
      this.events.emit('generation:cancelled', { requestId: request.requestId, reason });
      return createCancelledResult({
        requestId: request.requestId,
        backendName: registration.name,
        files: writer.getFiles(),
        warnings: writer.getWarnings(),
        executionTimeMs: durationMs,
      });
    }
    session.complete();
    const result = createSuccessResult({
      requestId: request.requestId,
      backendName: registration.name,
      files: writer.getFiles(),
      warnings: writer.getWarnings(),
      executionTimeMs: durationMs,
    });
    this.events.emit('generation:completed', {
      requestId: request.requestId,
      backendName: registration.name,
      fileCount: result.statistics.fileCount,
      durationMs,
    });
    return result;
  }

  /** Translate a backend error (or cancellation) into a result. */
  private handleGenerationError(
    error: unknown,
    session: GenerationSession,
    request: GenerationRequest,
    registration: BackendRegistration,
    writer: GenerationWriter,
    startedAtMs: number,
  ): GenerationResult {
    const durationMs = nowMs() - startedAtMs;
    session.fail();
    if (error instanceof CancellationError) {
      this.events.emit('generation:cancelled', { requestId: request.requestId, reason: error.reasonText });
      return createCancelledResult({
        requestId: request.requestId,
        backendName: registration.name,
        files: writer.getFiles(),
        warnings: writer.getWarnings(),
        executionTimeMs: durationMs,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    this.events.emit('generation:failed', {
      requestId: request.requestId,
      backendName: registration.name,
      error: message,
    });
    return createFailureResult({
      requestId: request.requestId,
      backendName: registration.name,
      files: writer.getFiles(),
      warnings: writer.getWarnings(),
      errors: [message],
      executionTimeMs: durationMs,
    });
  }

  /** Resolve a backend for a request, honoring an explicit metadata hint. */
  private locateBackend(request: GenerationRequest): BackendRegistration | undefined {
    const hint = request.metadata.backend;
    if (typeof hint === 'string' && this.backends.has(hint)) {
      return this.backends.get(hint);
    }
    for (const registration of this.backends.values()) {
      try {
        if (registration.backend.supports(request)) return registration;
      } catch (error) {
        this.logger.warning(
          'pipeline',
          `Backend "${registration.name}" threw during supports(): ${(error as Error).message}`,
        );
      }
    }
    return undefined;
  }

  /** Emit a failure event and build the matching result. */
  private emitFailure(
    request: GenerationRequest,
    backendName: string | undefined,
    message: string,
    startedAtMs: number,
  ): GenerationResult {
    this.events.emit('generation:failed', { requestId: request.requestId, backendName, error: message });
    return createFailureResult({
      requestId: request.requestId,
      backendName: backendName ?? 'unresolved',
      files: [],
      warnings: [],
      errors: [message],
      executionTimeMs: nowMs() - startedAtMs,
    });
  }
}

/** High-resolution timestamp with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
