/**
 * PRESERVE Authoring System — AI Orchestration Layer.
 *
 * AIRequest.ts defines the representation of a user or agent workflow request.
 * An AIRequest describes the user's intent, target authoring artifact,
 * operational constraints, and requested output format.
 *
 * This is pure descriptive data used as input by the PipelinePlanner. It
 * contains no executable logic, no file editing instructions, and no runtime
 * game references.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PipelineStage, WorkflowMetadata } from './AIOrchestratorTypes';

/**
 * A user or AI agent request describing an authoring workflow intent.
 * Plain data structure supporting deterministic JSON serialization.
 */
export interface AIRequest {
  /** Stable unique identifier for this request (e.g., 'req_ai_001'). */
  readonly requestId: string;
  /** Natural language or structured description of intent (e.g., "Create new enemy asset"). */
  readonly intent: string;
  /** Logical target identifier or category (e.g., 'enemy.slime', 'tower.archer'). */
  readonly target: string;
  /** Operational constraints governing workflow execution. */
  readonly constraints: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
  /** Logical output artifact requested by the caller (e.g., 'export_package', 'preview_snapshot', 'report'). */
  readonly requestedOutput: string;
  /** Optional explicit override of pipeline stages required for this request. */
  readonly requiredStages?: readonly PipelineStage[];
  /** Descriptive metadata attached to the request. */
  readonly metadata: WorkflowMetadata;
  /** ISO-8601 timestamp when the request was generated. */
  readonly createdAt: string;
}

/** Input accepted when constructing an {@link AIRequest}. */
export interface AIRequestInput {
  requestId?: string;
  intent: string;
  target: string;
  constraints?: Record<string, string | number | boolean | null | readonly string[]>;
  requestedOutput?: string;
  requiredStages?: readonly PipelineStage[];
  metadata?: WorkflowMetadata;
  /** Fixed ISO-8601 timestamp for reproducible tests and byte-stable output. */
  timestamp?: string;
}

/** Default output artifact requested when omitted by the caller. */
export const DEFAULT_REQUESTED_OUTPUT = 'report';

/**
 * Build a complete {@link AIRequest} from an input specification.
 * Deterministic when `requestId` and `timestamp` are supplied.
 */
export function createAIRequest(input: AIRequestInput): AIRequest {
  return {
    requestId: input.requestId ?? generateAIRequestId(),
    intent: input.intent.trim(),
    target: input.target.trim(),
    constraints: input.constraints ? { ...input.constraints } : {},
    requestedOutput: (input.requestedOutput ?? DEFAULT_REQUESTED_OUTPUT).trim(),
    requiredStages: input.requiredStages ? [...input.requiredStages] : undefined,
    metadata: input.metadata ? { ...input.metadata } : {},
    createdAt: input.timestamp ?? new Date().toISOString(),
  };
}

/** Generate a unique AI request identifier without relying on global mutable state. */
export function generateAIRequestId(): string {
  const anyGlobal = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof anyGlobal.crypto?.randomUUID === 'function') {
    return `req_ai_${anyGlobal.crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 9);
  return `req_ai_${Date.now().toString(36)}_${random}`;
}

/** Structured outcome of validating an {@link AIRequest}'s structural shape. */
export interface AIRequestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validate an {@link AIRequest}'s structural completeness.
 * Checks that required fields are present and non-empty.
 */
export function validateAIRequestShape(request: AIRequest): AIRequestValidationResult {
  const errors: string[] = [];
  if (typeof request?.requestId !== 'string' || request.requestId.length === 0) {
    errors.push('requestId is required and must be a non-empty string.');
  }
  if (typeof request?.intent !== 'string' || request.intent.trim().length === 0) {
    errors.push('intent is required and must be a non-empty string.');
  }
  if (typeof request?.target !== 'string' || request.target.trim().length === 0) {
    errors.push('target is required and must be a non-empty string.');
  }
  if (typeof request?.requestedOutput !== 'string' || request.requestedOutput.trim().length === 0) {
    errors.push('requestedOutput is required and must be a non-empty string.');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Serialize an {@link AIRequest} to a deterministic JSON string. */
export function aiRequestToJson(request: AIRequest, pretty = true): string {
  return JSON.stringify(request, null, pretty ? 2 : 0);
}
