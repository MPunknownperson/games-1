/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * RepairSuggestion.ts describes a possible fix for a verification finding.
 * A suggestion is *advice*: it records what is wrong, where, what action would
 * resolve it, and how risky that action is. It never applies the fix, never
 * edits files, and never touches the runtime.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { VerificationIssue, VerificationLocation } from './VerificationTypes';

/** How risky applying a suggested action would be. */
export const RepairRisk = {
  /** Mechanical change with no behavioural impact. */
  LOW: 'LOW',
  /** Structural change requiring review. */
  MEDIUM: 'MEDIUM',
  /** Invasive change that may alter behaviour. */
  HIGH: 'HIGH',
} as const;

/** Union of every supported risk level. */
export type RepairRisk = (typeof RepairRisk)[keyof typeof RepairRisk];

/** Broad classification of the action being suggested. */
export const RepairAction = {
  SPLIT_FILE: 'SPLIT_FILE',
  EXTRACT_FUNCTION: 'EXTRACT_FUNCTION',
  REMOVE_IMPORT: 'REMOVE_IMPORT',
  REPLACE_IMPORT: 'REPLACE_IMPORT',
  INJECT_VALUE: 'INJECT_VALUE',
  REMOVE_FUNCTION_VALUE: 'REMOVE_FUNCTION_VALUE',
  FIX_COMPILATION: 'FIX_COMPILATION',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const;

/** Union of every supported action kind. */
export type RepairAction = (typeof RepairAction)[keyof typeof RepairAction];

/** A described fix for one verification finding. */
export interface RepairSuggestion {
  /** Code of the issue this suggestion addresses. */
  readonly issueCode: string;
  /** Restatement of the problem being solved. */
  readonly issue: string;
  /** Where the fix would be applied. */
  readonly location?: VerificationLocation;
  /** Classification of the action. */
  readonly action: RepairAction;
  /** Concrete, human-readable description of what to do. */
  readonly suggestedAction: string;
  /** How risky applying the action would be. */
  readonly risk: RepairRisk;
  /** Whether a future tool could apply this mechanically. */
  readonly automatable: boolean;
}

/** Input accepted when constructing a suggestion. */
export interface RepairSuggestionInput {
  issueCode: string;
  issue: string;
  action: RepairAction;
  suggestedAction: string;
  risk?: RepairRisk;
  location?: VerificationLocation;
  automatable?: boolean;
}

/** Build a repair suggestion, defaulting the risk to `MEDIUM`. */
export function createRepairSuggestion(input: RepairSuggestionInput): RepairSuggestion {
  return {
    issueCode: input.issueCode,
    issue: input.issue,
    location: input.location,
    action: input.action,
    suggestedAction: input.suggestedAction,
    risk: input.risk ?? RepairRisk.MEDIUM,
    automatable: input.automatable ?? false,
  };
}

/** Maps issue codes onto their default repair advice. */
const SUGGESTION_TABLE: Readonly<
  Record<string, { action: RepairAction; text: string; risk: RepairRisk; automatable: boolean }>
> = {
  FILE_TOO_LONG: {
    action: RepairAction.SPLIT_FILE,
    text: 'Split the file into smaller focused modules until each is within the limit.',
    risk: RepairRisk.MEDIUM,
    automatable: false,
  },
  FUNCTION_TOO_LONG: {
    action: RepairAction.EXTRACT_FUNCTION,
    text: 'Extract cohesive blocks into named helper functions.',
    risk: RepairRisk.MEDIUM,
    automatable: false,
  },
  FORBIDDEN_IMPORT: {
    action: RepairAction.REMOVE_IMPORT,
    text: 'Remove the forbidden import; authoring code must stay dependency-free.',
    risk: RepairRisk.HIGH,
    automatable: false,
  },
  RUNTIME_COUPLING: {
    action: RepairAction.REPLACE_IMPORT,
    text: 'Replace the runtime import with a local structural type so the layer stays isolated.',
    risk: RepairRisk.HIGH,
    automatable: false,
  },
  NON_SERIALIZABLE_VALUE: {
    action: RepairAction.REMOVE_FUNCTION_VALUE,
    text: 'Replace the non-serializable value with plain data before exporting.',
    risk: RepairRisk.MEDIUM,
    automatable: false,
  },
  CIRCULAR_STRUCTURE: {
    action: RepairAction.MANUAL_REVIEW,
    text: 'Break the circular reference by storing an identifier instead of the object.',
    risk: RepairRisk.HIGH,
    automatable: false,
  },
  NON_DETERMINISTIC_SOURCE: {
    action: RepairAction.INJECT_VALUE,
    text: 'Accept the value as an injected parameter so output stays byte-stable.',
    risk: RepairRisk.LOW,
    automatable: true,
  },
  BUILD_FAILED: {
    action: RepairAction.FIX_COMPILATION,
    text: 'Resolve the reported compilation errors, then re-run verification.',
    risk: RepairRisk.HIGH,
    automatable: false,
  },
};

/**
 * Derive a repair suggestion for a finding.
 * Falls back to manual review when the issue code has no table entry.
 */
export function suggestRepair(issue: VerificationIssue): RepairSuggestion {
  const entry = SUGGESTION_TABLE[issue.code];
  if (!entry) {
    return createRepairSuggestion({
      issueCode: issue.code,
      issue: issue.message,
      location: issue.location,
      action: RepairAction.MANUAL_REVIEW,
      suggestedAction: 'Review the finding and decide on an appropriate fix.',
      risk: RepairRisk.MEDIUM,
    });
  }
  return createRepairSuggestion({
    issueCode: issue.code,
    issue: issue.message,
    location: issue.location,
    action: entry.action,
    suggestedAction: entry.text,
    risk: entry.risk,
    automatable: entry.automatable,
  });
}

/** Derive suggestions for a collection of findings, preserving order. */
export function suggestRepairs(
  issues: readonly VerificationIssue[],
): readonly RepairSuggestion[] {
  return issues.map(suggestRepair);
}
