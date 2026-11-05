/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * SelfReviewVerifier.ts consumes externally supplied verification evidence
 * (build result, type-check result, test result, import isolation, and scope
 * compliance) and produces a structured VerificationResult.
 *
 * It never executes compilers, shell commands, or tests — it only evaluates
 * the evidence supplied by existing tooling.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SelfReviewContext } from './SelfReviewContext';
import type { ChangeSummary } from './SelfReviewTypes';
import type { VerificationEvidence, VerificationResult } from './SelfReviewTypes';

/**
 * Evaluate verification evidence against the proposed change footprint and
 * context limits. Returns a structured result; never throws.
 */
export function verifySelfReview(
  evidence: VerificationEvidence,
  change: ChangeSummary,
  context: SelfReviewContext,
): VerificationResult {
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];

  checks.buildPassed = evidence.buildPassed;
  if (!evidence.buildPassed) errors.push('Build did not pass after the repair attempt.');

  checks.typeCheckPassed = evidence.typeCheckPassed;
  if (!evidence.typeCheckPassed) errors.push('Type checking did not pass after the repair attempt.');

  checks.testsPassed = evidence.testsPassed;
  if (!evidence.testsPassed) errors.push('Tests did not pass after the repair attempt.');

  checks.importIsolationPassed = evidence.importIsolationPassed;
  if (!evidence.importIsolationPassed) errors.push('Import isolation check failed (forbidden imports detected).');

  const noNewErrors = evidence.errorsAfter === 0;
  checks.noNewErrors = noNewErrors;
  if (!noNewErrors) errors.push(`Verification reported ${evidence.errorsAfter} new error(s).`);

  const scopeCompliant =
    evidence.actualChangedFiles <= context.maximumChangedFiles &&
    evidence.actualChangedLines <= context.maximumChangedLines &&
    evidence.actualChangedFiles <= change.changedFiles;
  checks.scopeCompliant = scopeCompliant;
  if (!scopeCompliant) {
    errors.push('Actual change footprint exceeds the approved scope or context limits.');
  }

  return { passed: errors.length === 0, checks, errors };
}

/** Summarize a verification result into a single line. */
export function summarizeVerification(result: VerificationResult): string {
  if (result.passed) return 'All verification checks passed.';
  return `Verification failed: ${result.errors.join('; ')}`;
}
