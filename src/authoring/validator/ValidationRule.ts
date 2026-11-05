/**
 * PRESERVE Authoring System — Validation System.
 *
 * ValidationRule.ts defines the contract every validation rule implements, plus
 * the validator contract that groups rules for a single target kind.
 *
 * Rules are independent: a rule never calls another rule, never mutates shared
 * state, and returns its findings as plain data. This keeps every rule
 * individually testable and order-independent.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ValidationContext } from './ValidationContext';
import type { ValidationIssue, ValidationTargetKind } from './ValidatorTypes';

/**
 * A single, independent structural check.
 *
 * @typeParam T - The shape of data this rule inspects.
 */
export interface ValidationRule<T> {
  /** Stable unique identifier, e.g. `ir.class.missing-name`. */
  readonly id: string;
  /** Short human-readable rule name. */
  readonly name: string;
  /** Explanation of what structural problem the rule detects. */
  readonly description: string;
  /**
   * Inspect `target` and return every finding discovered.
   * Must be pure: no mutation of `target`, no shared state, no I/O.
   */
  validate(target: T, context: ValidationContext): ValidationIssue[];
}

/**
 * A named collection of rules that all inspect the same kind of target.
 * The runner selects validators by `targetKind`, then executes their rules.
 *
 * @typeParam T - The shape of data this validator inspects.
 */
export interface Validator<T = unknown> {
  /** Stable unique validator identifier. */
  readonly id: string;
  /** Short human-readable validator name. */
  readonly name: string;
  /** Which kind of target this validator accepts. */
  readonly targetKind: ValidationTargetKind;
  /** The independent rules this validator executes. */
  readonly rules: readonly ValidationRule<T>[];
}

/** Input accepted by {@link defineRule}. */
export interface RuleSpec<T> {
  id: string;
  name: string;
  description: string;
  validate(target: T, context: ValidationContext): ValidationIssue[];
}

/** Create a rule from a specification. */
export function defineRule<T>(spec: RuleSpec<T>): ValidationRule<T> {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    validate: spec.validate,
  };
}

/** Input accepted by {@link defineValidator}. */
export interface ValidatorSpec<T> {
  id: string;
  name: string;
  targetKind: ValidationTargetKind;
  rules: readonly ValidationRule<T>[];
}

/** Create a validator from a specification. */
export function defineValidator<T>(spec: ValidatorSpec<T>): Validator<T> {
  return {
    id: spec.id,
    name: spec.name,
    targetKind: spec.targetKind,
    rules: [...spec.rules],
  };
}

/**
 * Verify a candidate implements the full {@link Validator} contract.
 * Throws an `Error` naming every missing or malformed member.
 */
export function assertValidatorShape(validator: Validator): void {
  const problems: string[] = [];
  if (typeof validator?.id !== 'string' || validator.id.length === 0) problems.push('id');
  if (typeof validator?.name !== 'string' || validator.name.length === 0) problems.push('name');
  if (typeof validator?.targetKind !== 'string') problems.push('targetKind');
  if (!Array.isArray(validator?.rules)) problems.push('rules');
  else {
    for (const rule of validator.rules) {
      if (typeof rule?.id !== 'string' || typeof rule?.validate !== 'function') {
        problems.push(`rule:${String(rule?.id ?? 'unknown')}`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`Invalid validator. Problems with: ${problems.join(', ')}`);
  }
}
