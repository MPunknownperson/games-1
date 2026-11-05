/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationRule.ts defines the contract every verification rule implements.
 *
 * Rules are independent: a rule never calls another rule, never mutates shared
 * state, and returns its findings as plain data. This keeps every rule
 * individually testable and order-independent.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { VerificationContext } from './VerificationContext';
import type {
  VerificationCategory,
  VerificationIssue,
  VerificationTargetKind,
} from './VerificationTypes';

/**
 * A single, independent quality check.
 *
 * @typeParam T - The shape of data this rule inspects.
 */
export interface VerificationRule<T = unknown> {
  /** Stable unique identifier, e.g. `structure.file-size`. */
  readonly id: string;
  /** Short human-readable rule name. */
  readonly name: string;
  /** Explanation of what problem the rule detects. */
  readonly description: string;
  /** Quality dimension this rule belongs to. */
  readonly category: VerificationCategory;
  /** Which kind of target this rule accepts. */
  readonly targetKind: VerificationTargetKind;
  /**
   * Inspect `target` and return every finding discovered.
   * Must be pure: no mutation of `target`, no shared state, no I/O.
   */
  verify(target: T, context: VerificationContext): VerificationIssue[];
}

/** Input accepted by {@link defineRule}. */
export interface VerificationRuleSpec<T> {
  id: string;
  name: string;
  description: string;
  category: VerificationCategory;
  targetKind: VerificationTargetKind;
  verify(target: T, context: VerificationContext): VerificationIssue[];
}

/** Create a verification rule from a specification. */
export function defineRule<T>(spec: VerificationRuleSpec<T>): VerificationRule<T> {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    targetKind: spec.targetKind,
    verify: spec.verify,
  };
}

/**
 * Verify a candidate implements the full {@link VerificationRule} contract.
 * Throws an `Error` naming every missing or malformed member.
 */
export function assertRuleShape(rule: VerificationRule): void {
  const problems: string[] = [];
  if (typeof rule?.id !== 'string' || rule.id.length === 0) problems.push('id');
  if (typeof rule?.name !== 'string' || rule.name.length === 0) problems.push('name');
  if (typeof rule?.description !== 'string') problems.push('description');
  if (typeof rule?.category !== 'string') problems.push('category');
  if (typeof rule?.targetKind !== 'string') problems.push('targetKind');
  if (typeof rule?.verify !== 'function') problems.push('verify');
  if (problems.length > 0) {
    throw new Error(`Invalid verification rule. Problems with: ${problems.join(', ')}`);
  }
}

/** Compare two rules by identifier, for deterministic ordering. */
export function compareRules(left: VerificationRule, right: VerificationRule): number {
  return left.id.localeCompare(right.id);
}
