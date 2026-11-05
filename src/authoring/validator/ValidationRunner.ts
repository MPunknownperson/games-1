/**
 * PRESERVE Authoring System — Validation System.
 *
 * ValidationRunner.ts coordinates validation. It receives a target, selects the
 * validators registered for that target kind, executes their rules, collects
 * results, and produces a {@link ValidationReport}.
 *
 * The runner contains no validation rules of its own — it only orchestrates.
 * A rule that throws is captured as an error issue so one faulty rule can never
 * abort an entire pass.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { createValidationContext, type ValidationContext, type ValidationContextOptions } from './ValidationContext';
import { ValidationReport } from './ValidationReport';
import { createValidationResult, type ValidationResult } from './ValidationResult';
import type { Validator } from './ValidationRule';
import type { ValidatorRegistry } from './ValidatorRegistry';
import {
  ValidationSeverity,
  createIssue,
  type ValidationIssue,
  type ValidationTarget,
} from './ValidatorTypes';

/** Options accepted when constructing a {@link ValidationRunner}. */
export interface ValidationRunnerOptions {
  /** Title applied to produced reports. */
  title?: string;
  /** Halt the pass after the first validator that reports an error. */
  stopOnError?: boolean;
}

/** High-resolution timestamp with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Coordinates validator selection and execution.
 * Composition-friendly: hold a registry rather than extending it.
 */
export class ValidationRunner {
  private readonly registry: ValidatorRegistry;
  private readonly title: string;
  private readonly stopOnError: boolean;

  constructor(registry: ValidatorRegistry, options: ValidationRunnerOptions = {}) {
    this.registry = registry;
    this.title = options.title ?? 'Validation Report';
    this.stopOnError = options.stopOnError ?? false;
  }

  /** The registry this runner draws validators from. */
  getRegistry(): ValidatorRegistry {
    return this.registry;
  }

  /**
   * Run every validator registered for the target's kind.
   * Always resolves with a report; validator failures never throw.
   */
  runAll(target: ValidationTarget, options: ValidationContextOptions = {}): ValidationReport {
    const context = createValidationContext(options);
    const validators = this.registry.listByKind(target.kind);
    const report = new ValidationReport(this.title);
    for (const validator of validators) {
      const result = this.executeValidator(validator, target, context);
      report.add(result);
      if (!result.passed && this.stopOnError) break;
    }
    return report;
  }

  /**
   * Run a single validator by identifier.
   * @throws {Error} when no validator with that identifier is registered, or
   *   when the validator does not accept the target's kind.
   */
  runOne(
    validatorId: string,
    target: ValidationTarget,
    options: ValidationContextOptions = {},
  ): ValidationReport {
    const validator = this.registry.get(validatorId);
    if (!validator) {
      throw new Error(`No validator named "${validatorId}" is registered.`);
    }
    if (validator.targetKind !== target.kind) {
      throw new Error(
        `Validator "${validatorId}" accepts ${validator.targetKind} targets, received ${target.kind}.`,
      );
    }
    const context = createValidationContext(options);
    const report = new ValidationReport(this.title);
    report.add(this.executeValidator(validator, target, context));
    return report;
  }

  /** Execute one validator's rules and time the whole validator. */
  private executeValidator(
    validator: Validator<never>,
    target: ValidationTarget,
    context: ValidationContext,
  ): ValidationResult {
    const started = nowMs();
    const issues: ValidationIssue[] = [];
    for (const rule of validator.rules) {
      issues.push(...this.executeRule(validator.id, rule.id, () => rule.validate(target.data as never, context)));
    }
    return createValidationResult({
      validatorName: validator.id,
      issues: this.applyStrictness(issues, context),
      executionTime: nowMs() - started,
    });
  }

  /** Run one rule, converting a thrown error into a reportable issue. */
  private executeRule(
    validatorId: string,
    ruleId: string,
    invoke: () => ValidationIssue[],
  ): ValidationIssue[] {
    try {
      const produced = invoke();
      return Array.isArray(produced) ? produced : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [
        createIssue('VALIDATOR_RULE_THREW', `Rule "${ruleId}" threw during execution: ${message}`, {
          severity: ValidationSeverity.ERROR,
          location: { path: `${validatorId}.${ruleId}` },
          suggestion: 'Fix the rule implementation so it returns issues instead of throwing.',
        }),
      ];
    }
  }

  /** In strict mode, promote warnings to errors. */
  private applyStrictness(
    issues: readonly ValidationIssue[],
    context: ValidationContext,
  ): ValidationIssue[] {
    if (!context.strict) return [...issues];
    return issues.map((issue) =>
      issue.severity === ValidationSeverity.WARNING
        ? { ...issue, severity: ValidationSeverity.ERROR }
        : issue,
    );
  }
}
