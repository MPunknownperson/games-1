/** Immutable safety context for AI-assisted repair planning and execution. */
import { RepairScope, type RepairScope as RepairScopeType } from './SafeRepairTypes';

/** Approval behavior applied to non-trivial repairs. */
export interface ApprovalPolicy {
  readonly requireApprovalForModerate: boolean;
  readonly requireApprovalForPublicApiChanges: boolean;
  readonly requireApprovalForDependencyChanges: boolean;
  readonly approvalReference?: string;
}

/** Verification requirements supplied to the verifier as result gates. */
export interface RepairVerificationRequirements {
  readonly buildRequired: boolean;
  readonly typeCheckRequired: boolean;
  readonly testsRequired: boolean;
  readonly forbiddenImportCheckRequired: boolean;
  readonly changedPathCheckRequired: boolean;
}

/** Immutable context defining repair boundaries. */
export interface SafeRepairContext {
  readonly projectVersion: string;
  readonly allowedPaths: readonly string[];
  readonly protectedPaths: readonly string[];
  readonly maximumRepairScope: RepairScopeType;
  readonly verification: RepairVerificationRequirements;
  readonly approvalPolicy: ApprovalPolicy;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

/** Options used to construct a safe-repair context. */
export interface SafeRepairContextOptions {
  projectVersion?: string;
  allowedPaths?: readonly string[];
  protectedPaths?: readonly string[];
  maximumRepairScope?: RepairScopeType;
  verification?: Partial<RepairVerificationRequirements>;
  approvalPolicy?: Partial<ApprovalPolicy>;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Default paths that automated repairs may target. */
export const DEFAULT_ALLOWED_PATHS = ['src/authoring/'] as const;

/** Default runtime and product paths protected from automatic repairs. */
export const DEFAULT_PROTECTED_PATHS = [
  'src/engine/',
  'src/runtime/',
  'src/game/',
  'src/ui/',
] as const;

/** Default verification gates required after every automatic repair. */
export const DEFAULT_VERIFICATION_REQUIREMENTS: RepairVerificationRequirements = {
  buildRequired: true,
  typeCheckRequired: true,
  testsRequired: true,
  forbiddenImportCheckRequired: true,
  changedPathCheckRequired: true,
};

/** Create an immutable repair context with safety-first defaults. */
export function createSafeRepairContext(
  options: SafeRepairContextOptions = {},
): SafeRepairContext {
  return {
    projectVersion: options.projectVersion ?? '0.0.0',
    allowedPaths: options.allowedPaths ? [...options.allowedPaths] : [...DEFAULT_ALLOWED_PATHS],
    protectedPaths: options.protectedPaths ? [...options.protectedPaths] : [...DEFAULT_PROTECTED_PATHS],
    maximumRepairScope: options.maximumRepairScope ?? RepairScope.SMALL,
    verification: { ...DEFAULT_VERIFICATION_REQUIREMENTS, ...options.verification },
    approvalPolicy: {
      requireApprovalForModerate: true,
      requireApprovalForPublicApiChanges: true,
      requireApprovalForDependencyChanges: true,
      ...options.approvalPolicy,
    },
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/** Return whether a logical path sits within an approved prefix. */
export function pathMatchesAny(path: string, prefixes: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, '/');
  return prefixes.some((prefix) => normalized.startsWith(prefix.replace(/\\/g, '/')));
}