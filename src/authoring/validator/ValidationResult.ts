/**
 * PRESERVE Authoring System — Validation System.
 *
 * ValidationResult.ts describes the outcome of running one validator against
 * one target. Results are plain, JSON-serializable data with no functions.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  ValidationSeverity,
  countBySeverity,
  type ValidationIssue,
} from './ValidatorTypes';

/** Outcome of a single validator execution. */
export interface ValidationResult {
  /** True when the validator produced no `ERROR`-severity issues. */
  readonly passed: boolean;
  /** Every finding produced, in discovery order. */
  readonly issues: readonly ValidationIssue[];
  /** Wall-clock milliseconds spent executing the validator. */
  readonly executionTime: number;
  /** Identifier of the validator that produced this result. */
  readonly validatorName: string;
  /** Count of `ERROR`-severity findings. */
  readonly errorCount: number;
  /** Count of `WARNING`-severity findings. */
  readonly warningCount: number;
  /** Count of `INFO`-severity findings. */
  readonly infoCount: number;
}

/** Inputs accepted by {@link createValidationResult}. */
export interface ValidationResultInput {
  validatorName: string;
  issues: readonly ValidationIssue[];
  executionTime: number;
}

/**
 * Build a {@link ValidationResult}, deriving `passed` and the severity counts
 * from the supplied issues.
 */
export function createValidationResult(input: ValidationResultInput): ValidationResult {
  const issues = [...input.issues];
  const errorCount = countBySeverity(issues, ValidationSeverity.ERROR);
  const warningCount = countBySeverity(issues, ValidationSeverity.WARNING);
  const infoCount = countBySeverity(issues, ValidationSeverity.INFO);
  return {
    passed: errorCount === 0,
    issues,
    executionTime: input.executionTime,
    validatorName: input.validatorName,
    errorCount,
    warningCount,
    infoCount,
  };
}

/** Serialize a single result to a JSON string. */
export function resultToJson(result: ValidationResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
