/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationRunner.ts executes verification rules in deterministic order,
 * collects their results, and produces a {@link VerificationReport}.
 *
 * The runner contains no business logic and no checks of its own — it only
 * orchestrates. A rule that throws is captured as an error finding so one
 * faulty rule can never abort an entire pass.
 *
 * Ordering: rules are selected by target kind and executed sorted by
 * identifier; targets are processed in the order supplied by the caller.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  createVerificationContext,
  type VerificationContext,
  type VerificationContextOptions,
} from './VerificationContext';
import { VerificationReport } from './VerificationReport';
import { createVerificationResult, type VerificationResult } from './VerificationResult';
import type { VerificationRule } from './VerificationRule';
import type { VerificationRegistry } from './VerificationRegistry';
import {
  VerificationCategory,
  VerificationSeverity,
  createIssue,
  type VerificationIssue,
  type VerificationTarget,
} from './VerificationTypes';

/** Options accepted when constructing a {@link VerificationRunner}. */
export interface VerificationRunnerOptions {
  /** Title applied to produced reports. */
  title?: string;
  /** Halt the pass after the first rule that reports an error. */
  stopOnError?: boolean;
}

/** High-resolution timestamp with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Coordinates rule selection and execution.
 * Composition-friendly: holds a registry rather than extending it.
 */
export class VerificationRunner {
  private readonly registry: VerificationRegistry;
  private readonly title: string;
  private readonly stopOnError: boolean;

  constructor(registry: VerificationRegistry, options: VerificationRunnerOptions = {}) {
    this.registry = registry;
    this.title = options.title ?? 'Verification Report';
    this.stopOnError = options.stopOnError ?? false;
  }

  /** The registry this runner draws rules from. */
  getRegistry(): VerificationRegistry {
    return this.registry;
  }

  /**
   * Run every rule matching the target's kind.
   * Always returns a report; rule failures never throw.
   */
  run(
    target: VerificationTarget,
    options: VerificationContextOptions = {},
  ): VerificationReport {
    return this.runMany([target], options);
  }

  /**
   * Run every matching rule across several targets.
   * Targets are processed in the supplied order; rules run sorted by id.
   */
  runMany(
    targets: readonly VerificationTarget[],
    options: VerificationContextOptions = {},
  ): VerificationReport {
    const context = createVerificationContext(options);
    const report = new VerificationReport(this.title, context.projectVersion);
    for (const target of targets) {
      const rules = this.registry.listByKind(target.kind);
      const halted = this.runRulesForTarget(rules, target, context, report);
      if (halted) break;
    }
    return report;
  }

  /**
   * Run a single rule by identifier against one target.
   * @throws {Error} when the rule is missing or rejects the target kind.
   */
  runOne(
    ruleId: string,
    target: VerificationTarget,
    options: VerificationContextOptions = {},
  ): VerificationReport {
    const rule = this.registry.get(ruleId);
    if (!rule) throw new Error(`No verification rule named "${ruleId}" is registered.`);
    if (rule.targetKind !== target.kind) {
      throw new Error(
        `Rule "${ruleId}" accepts ${rule.targetKind} targets, received ${target.kind}.`,
      );
    }
    const context = createVerificationContext(options);
    const report = new VerificationReport(this.title, context.projectVersion);
    report.add(this.executeRule(rule, target, context));
    return report;
  }

  /** Execute every rule for one target. Returns true when the pass halted. */
  private runRulesForTarget(
    rules: readonly VerificationRule<never>[],
    target: VerificationTarget,
    context: VerificationContext,
    report: VerificationReport,
  ): boolean {
    for (const rule of rules) {
      const result = this.executeRule(rule, target, context);
      report.add(result);
      if (!result.passed && this.stopOnError) return true;
    }
    return false;
  }

  /** Execute one rule, timing it and capturing any thrown error. */
  private executeRule(
    rule: VerificationRule<never>,
    target: VerificationTarget,
    context: VerificationContext,
  ): VerificationResult {
    const started = nowMs();
    const findings = this.invokeRule(rule, target, context);
    return createVerificationResult({
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      targetLabel: target.label ?? target.kind,
      findings,
      durationMs: nowMs() - started,
    });
  }

  /** Invoke a rule, converting a thrown error into a reportable finding. */
  private invokeRule(
    rule: VerificationRule<never>,
    target: VerificationTarget,
    context: VerificationContext,
  ): VerificationIssue[] {
    try {
      const produced = rule.verify(target.data as never, context);
      return Array.isArray(produced) ? produced : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [
        createIssue(
          'VERIFICATION_RULE_THREW',
          VerificationCategory.STRUCTURE,
          `Rule "${rule.id}" threw during execution: ${message}`,
          { severity: VerificationSeverity.ERROR, location: { symbol: rule.id } },
        ),
      ];
    }
  }
}
