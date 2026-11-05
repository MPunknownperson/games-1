/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * DecisionContext.ts provides an immutable execution context carrying project
 * version, workflow identifier, issue source, safety boundary paths, and policy
 * configuration into risk assessments, impact analyzers, and decision evaluators.
 *
 * It holds no reference to engine, UI, gameplay, or filesystem systems — only
 * structural coordination and policy parameters are stored. No global mutable state.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Configurable policy thresholds governing automatic decision approval. */
export interface DecisionPolicyConfig {
  /** Minimum confidence score required for automatic repair approval (default: 0.85). */
  readonly minAutoConfidence: number;
  /** Maximum number of changed lines permitted for automatic repair (default: 50). */
  readonly maxAutoLinesChanged: number;
  /** Whether automatic repair is permitted when public API changes occur (default: false). */
  readonly allowAutoWhenApiChanged: boolean;
  /** Whether automatic repair is permitted when dependency changes occur (default: false). */
  readonly allowAutoWhenDependencyChanged: boolean;
}

/** Default policy thresholds matching standard PRESERVE safety guidelines. */
export const DEFAULT_DECISION_POLICY_CONFIG: Readonly<DecisionPolicyConfig> = {
  minAutoConfidence: 0.85,
  maxAutoLinesChanged: 50,
  allowAutoWhenApiChanged: false,
  allowAutoWhenDependencyChanged: false,
};

/** Immutable decision context handed to evaluators and analyzers. */
export interface DecisionContext {
  /** Version of the project being evaluated. */
  readonly projectVersion: string;
  /** Stable identifier for the current authoring workflow or session. */
  readonly workflowId: string;
  /** Originating system or tool that reported the issue (e.g., 'verification', 'qa_evidence'). */
  readonly issueSource: string;
  /** Path prefixes or globs where automatic repairs are permitted. */
  readonly allowedAutoRepairScope: readonly string[];
  /** Path prefixes or globs where automatic repairs are strictly forbidden. */
  readonly protectedAreas: readonly string[];
  /** Operational thresholds governing automatic approval. */
  readonly policyConfiguration: DecisionPolicyConfig;
  /** Free-form, JSON-serializable metadata dictionary. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

/** Options accepted when constructing a {@link DecisionContext}. */
export interface DecisionContextOptions {
  projectVersion?: string;
  workflowId?: string;
  issueSource?: string;
  allowedAutoRepairScope?: readonly string[];
  protectedAreas?: readonly string[];
  policyConfiguration?: Partial<DecisionPolicyConfig>;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Default allowed authoring scope paths. */
export const DEFAULT_ALLOWED_AUTO_REPAIR_SCOPE: readonly string[] = [
  'src/authoring/',
  'src/authoring/*',
];

/** Default protected runtime, engine, and game paths. */
export const DEFAULT_PROTECTED_AREAS: readonly string[] = [
  'src/engine/',
  'src/engine/*',
  'src/runtime/',
  'src/runtime/*',
  'src/game/',
  'src/game/*',
  'src/ui/',
  'src/ui/*',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
];

/** Default context matching standard PRESERVE decision guidelines. */
export const DEFAULT_DECISION_CONTEXT: Readonly<DecisionContext> = {
  projectVersion: '0.0.0',
  workflowId: 'default_workflow',
  issueSource: 'unspecified_source',
  allowedAutoRepairScope: DEFAULT_ALLOWED_AUTO_REPAIR_SCOPE,
  protectedAreas: DEFAULT_PROTECTED_AREAS,
  policyConfiguration: DEFAULT_DECISION_POLICY_CONFIG,
  metadata: {},
};

/** Build an immutable {@link DecisionContext} from an input specification. */
export function createDecisionContext(
  options: DecisionContextOptions = {},
): DecisionContext {
  return {
    projectVersion: options.projectVersion ?? DEFAULT_DECISION_CONTEXT.projectVersion,
    workflowId: options.workflowId ?? `workflow_${Date.now().toString(36)}`,
    issueSource: options.issueSource ?? DEFAULT_DECISION_CONTEXT.issueSource,
    allowedAutoRepairScope: options.allowedAutoRepairScope
      ? [...options.allowedAutoRepairScope]
      : [...DEFAULT_ALLOWED_AUTO_REPAIR_SCOPE],
    protectedAreas: options.protectedAreas
      ? [...options.protectedAreas]
      : [...DEFAULT_PROTECTED_AREAS],
    policyConfiguration: { ...DEFAULT_DECISION_POLICY_CONFIG, ...options.policyConfiguration },
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/** Return a copy of `context` with the supplied changes applied. */
export function withDecisionContextChanges(
  context: DecisionContext,
  changes: DecisionContextOptions,
): DecisionContext {
  return {
    projectVersion: changes.projectVersion ?? context.projectVersion,
    workflowId: changes.workflowId ?? context.workflowId,
    issueSource: changes.issueSource ?? context.issueSource,
    allowedAutoRepairScope: changes.allowedAutoRepairScope
      ? [...changes.allowedAutoRepairScope]
      : [...context.allowedAutoRepairScope],
    protectedAreas: changes.protectedAreas
      ? [...changes.protectedAreas]
      : [...context.protectedAreas],
    policyConfiguration: changes.policyConfiguration
      ? { ...context.policyConfiguration, ...changes.policyConfiguration }
      : context.policyConfiguration,
    metadata: changes.metadata ? { ...context.metadata, ...changes.metadata } : context.metadata,
  };
}

/** Check whether a logical file path matches any prefix in a list of patterns. */
export function matchesPathPattern(path: string, patterns: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, '/');
  for (const pattern of patterns) {
    const normPat = pattern.replace(/\\/g, '/');
    if (normPat.endsWith('/*') || normPat.endsWith('*')) {
      const prefix = normPat.replace(/\*+$/, '');
      if (normalized.startsWith(prefix)) return true;
    } else if (normPat.endsWith('/')) {
      if (normalized.startsWith(normPat) || normalized === normPat.slice(0, -1)) return true;
    } else if (normalized === normPat || normalized.startsWith(`${normPat}/`)) {
      return true;
    }
  }
  return false;
}
