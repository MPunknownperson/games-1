/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationRequest.ts defines the request shape and its factory. A request is
 * plain, serializable data: it describes what should be generated (schema id
 * and version), for which language, to which target, and under which policies.
 * It does NOT describe how generation happens — that is the backend's role.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SemanticVersion } from '../schema/SchemaTypes';
import type { GenerationTargetDescriptor } from './GenerationTarget';
import { createMemoryTarget } from './GenerationTarget';

/** Build mode a request runs under. Mirrors the authoring build modes but is
 * declared locally so the generator has no cross-module dependency. */
export type GenerationBuildMode = 'development' | 'production' | 'preview';

/** How the writer should behave when an output path collides with an
 * existing entry in a downstream sink. The pipeline never enforces this
 * directly; backends and writers consume the value. */
export type OverwritePolicy = 'skip' | 'overwrite' | 'error' | 'merge';

/** Style of generation requested by the caller. Backends interpret this. */
export type GenerationMode = 'full' | 'incremental' | 'preview' | 'dry-run';

/**
 * One generation job. Fully serializable to JSON with no functions or
 * references to runtime objects.
 */
export interface GenerationRequest {
  readonly requestId: string;
  readonly schemaId: string;
  readonly schemaVersion: SemanticVersion;
  readonly targetLanguage: string;
  readonly targetDirectory: string;
  readonly target: GenerationTargetDescriptor;
  readonly buildMode: GenerationBuildMode;
  readonly overwritePolicy: OverwritePolicy;
  readonly generationMode: GenerationMode;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/** Options accepted by {@link createRequest}. Unspecified fields use defaults. */
export interface GenerationRequestInput {
  requestId?: string;
  schemaId: string;
  schemaVersion: SemanticVersion;
  targetLanguage: string;
  targetDirectory?: string;
  target?: GenerationTargetDescriptor;
  buildMode?: GenerationBuildMode;
  overwritePolicy?: OverwritePolicy;
  generationMode?: GenerationMode;
  metadata?: Record<string, unknown>;
  /** Fixed ISO-8601 timestamp for reproducible tests and byte-stable output. */
  timestamp?: string;
}

/** Result of {@link validateRequestShape}. */
export interface RequestShapeResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Default target directory used when a request omits one. */
export const DEFAULT_TARGET_DIRECTORY = '.';

/**
 * Create a fully populated {@link GenerationRequest}.
 * Deterministic when `requestId` and `timestamp` are supplied.
 */
export function createRequest(input: GenerationRequestInput): GenerationRequest {
  return {
    requestId: input.requestId ?? generateRequestId(),
    schemaId: input.schemaId,
    schemaVersion: input.schemaVersion,
    targetLanguage: input.targetLanguage,
    targetDirectory: input.targetDirectory ?? DEFAULT_TARGET_DIRECTORY,
    target: input.target ?? createMemoryTarget(),
    buildMode: input.buildMode ?? 'development',
    overwritePolicy: input.overwritePolicy ?? 'error',
    generationMode: input.generationMode ?? 'full',
    metadata: input.metadata ? { ...input.metadata } : {},
    createdAt: input.timestamp ?? new Date().toISOString(),
  };
}

/** Generate a unique request identifier without relying on module state. */
export function generateRequestId(): string {
  const anyGlobal = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof anyGlobal.crypto?.randomUUID === 'function') {
    return `req_${anyGlobal.crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `req_${Date.now().toString(36)}_${random}`;
}

/**
 * Validate a request's shape (structural fields only).
 * The pipeline calls this before dispatch; backend-specific requirements are
 * enforced by the backend via its `supports()` method.
 */
export function validateRequestShape(request: GenerationRequest): RequestShapeResult {
  const errors: string[] = [];
  if (typeof request?.requestId !== 'string' || request.requestId.length === 0) errors.push('requestId is required');
  if (typeof request?.schemaId !== 'string' || request.schemaId.length === 0) errors.push('schemaId is required');
  if (!request?.schemaVersion || typeof request.schemaVersion !== 'object') errors.push('schemaVersion is required');
  if (typeof request?.targetLanguage !== 'string' || request.targetLanguage.length === 0) errors.push('targetLanguage is required');
  if (!request?.target || typeof request.target !== 'object') errors.push('target is required');
  return { valid: errors.length === 0, errors };
}

/** Serialize a request to a JSON string. */
export function requestToJson(request: GenerationRequest, pretty = true): string {
  return JSON.stringify(request, null, pretty ? 2 : 0);
}
