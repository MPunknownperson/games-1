/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairPlanner.ts is the core planning engine. It converts verification
 * findings (from reports, results, or issue lists) into structured,
 * deterministic repair plans.
 *
 * The planner inspects structural issue codes and locations to formulate
 * proposed actions. It does NOT modify anything, never edits files, and never
 * connects to runtime, engine, or filesystem systems.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { VerificationIssue } from '../verification/VerificationTypes';
import { createRepairAction, type RepairAction } from './RepairAction';
import { DEFAULT_REPAIR_CONTEXT, type RepairContext } from './RepairContext';
import { RepairPlan } from './RepairPlan';
import { DEFAULT_REPAIR_POLICY, type RepairPolicy } from './RepairPolicy';
import {
  createBlockedRepairResult,
  createSuccessRepairResult,
  type RepairResult,
} from './RepairResult';
import {
  RepairActionType,
  RepairRisk,
  createIssueReference,
  createRepairTarget,
  type RepairTarget,
} from './RepairTypes';

/** Structural view of an upstream verification result or report. */
interface VerificationContainer {
  readonly getAllIssues?: () => readonly VerificationIssue[];
  readonly issues?: readonly VerificationIssue[];
  readonly warnings?: readonly VerificationIssue[];
  readonly info?: readonly VerificationIssue[];
}

/**
 * Core planning engine that converts verification findings into safe repair plans.
 * Composition-friendly: hold an instance or invoke static/standalone helpers.
 */
export class RepairPlanner {
  private readonly defaultPolicy: RepairPolicy;

  constructor(policy: RepairPolicy = DEFAULT_REPAIR_POLICY) {
    this.defaultPolicy = policy;
  }

  /**
   * Convert verification findings into a complete {@link RepairPlan}.
   * Does not evaluate safety policy; call {@link planRepairs} for policy validation.
   */
  buildPlan(
    input: unknown,
    options: { planId?: string; timestamp?: string } = {},
  ): RepairPlan {
    const issues = extractIssues(input);
    const plan = new RepairPlan({
      planId: options.planId,
      createdAt: options.timestamp,
    });

    let counter = 1;
    for (const issue of issues) {
      if (issue.severity === 'INFO') continue;
      const action = this.deriveActionForIssue(issue, counter++);
      if (action) {
        plan.addAction(action);
      }
    }
    return plan;
  }

  /**
   * Coordinate planning and safety validation.
   * Produces a {@link RepairResult} indicating whether the planned actions are allowed or blocked.
   */
  planRepairs(
    input: unknown,
    context: RepairContext = DEFAULT_REPAIR_CONTEXT,
    policy: RepairPolicy = this.defaultPolicy,
    options: { planId?: string; timestamp?: string } = {},
  ): RepairResult {
    const plan = this.buildPlan(input, options);
    const policyResult = policy.evaluatePlan(plan, context);

    if (!policyResult.allowed) {
      return createBlockedRepairResult(policyResult.violations, {
        plan,
        timestamp: options.timestamp,
      });
    }

    return createSuccessRepairResult(plan, {
      warnings: policyResult.violations,
      timestamp: options.timestamp,
    });
  }

  /** Formulate a proposed repair action for a single verification issue. */
  private deriveActionForIssue(issue: VerificationIssue, index: number): RepairAction | null {
    const targetPath = resolveIssuePath(issue);
    const targetId = resolveTargetIdentifier(issue, targetPath);
    const issueRef = createIssueReference({
      issueId: issue.code,
      severity: issue.severity,
      message: issue.message,
      source: issue.category,
    });

    const target: RepairTarget = createRepairTarget({
      identifier: targetId,
      path: targetPath,
      location: issue.location ? { ...issue.location } : undefined,
      description: `Target artifact for issue ${issue.code}`,
    });

    const mapping = lookupActionMapping(issue.code, issue.message);
    const actionId = `act_${String(index).padStart(3, '0')}_${issue.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    return createRepairAction({
      id: actionId,
      type: mapping.type,
      target,
      description: mapping.description,
      reason: `Resolution for verification issue ${issue.code}: ${issue.message}`,
      risk: mapping.risk,
      confidence: mapping.confidence,
      requiresVerification: mapping.requiresVerification,
      issueReference: issueRef,
    });
  }
}

/** Extract a flat list of issues from flexible verification container shapes. */
function extractIssues(input: unknown): readonly VerificationIssue[] {
  if (!input) return [];
  if (Array.isArray(input)) return input as VerificationIssue[];
  const container = input as VerificationContainer;
  if (typeof container.getAllIssues === 'function') {
    return container.getAllIssues();
  }
  const issues = container.issues ? [...container.issues] : [];
  const warnings = container.warnings ? [...container.warnings] : [];
  return [...issues, ...warnings];
}

/** Determine the logical file path from an issue's location. */
function resolveIssuePath(issue: VerificationIssue): string {
  if (issue.location?.file && issue.location.file.trim().length > 0) {
    return issue.location.file.trim();
  }
  if (issue.location?.symbol && issue.location.symbol.includes('/')) {
    return issue.location.symbol.trim();
  }
  return 'src/authoring/unresolved_target.ts';
}

/** Determine a stable target identifier from an issue. */
function resolveTargetIdentifier(issue: VerificationIssue, path: string): string {
  if (issue.location?.symbol && !issue.location.symbol.includes('/')) {
    return issue.location.symbol.trim();
  }
  const parts = path.replace(/\\/g, '/').split('/');
  const filename = parts[parts.length - 1] ?? 'artifact';
  return filename.replace(/\.[^/.]+$/, '');
}

/** Mapping rule structure for issue codes. */
interface ActionMapping {
  readonly type: RepairActionType;
  readonly description: string;
  readonly risk: RepairRisk;
  readonly confidence: number;
  readonly requiresVerification: boolean;
}

/** Deterministic lookup mapping verification issue codes to proposed actions. */
function lookupActionMapping(code: string, message: string): ActionMapping {
  switch (code) {
    case 'SOURCE_NO_EXPORTS':
    case 'EXPORT_MISSING':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Add missing export declaration',
        risk: RepairRisk.LOW,
        confidence: 0.95,
        requiresVerification: true,
      };
    case 'FILE_TOO_LONG':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Split file into smaller focused modules',
        risk: RepairRisk.MEDIUM,
        confidence: 0.85,
        requiresVerification: true,
      };
    case 'FUNCTION_TOO_LONG':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Extract cohesive logic into named helper functions',
        risk: RepairRisk.MEDIUM,
        confidence: 0.9,
        requiresVerification: true,
      };
    case 'FORBIDDEN_IMPORT':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Remove forbidden external import from authoring module',
        risk: RepairRisk.HIGH,
        confidence: 0.8,
        requiresVerification: true,
      };
    case 'RUNTIME_COUPLING':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Replace runtime import with local structural type',
        risk: RepairRisk.HIGH,
        confidence: 0.8,
        requiresVerification: true,
      };
    case 'NON_SERIALIZABLE_VALUE':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Replace non-serializable value with plain data before exporting',
        risk: RepairRisk.MEDIUM,
        confidence: 0.9,
        requiresVerification: true,
      };
    case 'CIRCULAR_STRUCTURE':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Break circular reference by storing an identifier instead of object reference',
        risk: RepairRisk.HIGH,
        confidence: 0.75,
        requiresVerification: true,
      };
    case 'NON_DETERMINISTIC_SOURCE':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Accept value as an injected parameter for byte-stable output',
        risk: RepairRisk.LOW,
        confidence: 0.9,
        requiresVerification: true,
      };
    case 'BUILD_FAILED':
    case 'BUILD_COMPILATION_ERROR':
      return {
        type: RepairActionType.EDIT_FILE,
        description: `Resolve compilation failure: ${message.slice(0, 60)}`,
        risk: RepairRisk.HIGH,
        confidence: 0.7,
        requiresVerification: true,
      };
    case 'IR_DECLARATION_MISSING_NAME':
    case 'IR_NODE_MISSING_KIND':
    case 'IR_FILE_MISSING_IDENTIFIER':
      return {
        type: RepairActionType.EDIT_FILE,
        description: 'Add missing structural identifier or discriminator to IR node',
        risk: RepairRisk.LOW,
        confidence: 0.95,
        requiresVerification: true,
      };
    default:
      return {
        type: RepairActionType.EDIT_FILE,
        description: `Investigate and resolve verification finding (${code})`,
        risk: RepairRisk.MEDIUM,
        confidence: 0.6,
        requiresVerification: true,
      };
  }
}
