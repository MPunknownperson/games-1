/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationRegistry.ts stores verification rules in memory, keyed by
 * identifier, and indexes them by target kind and category.
 *
 * Every registry instance owns its storage — there is no global mutable state,
 * no filesystem access, and no network access.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { assertRuleShape, compareRules, type VerificationRule } from './VerificationRule';
import type { VerificationCategory, VerificationTargetKind } from './VerificationTypes';

/** Raised when registering a rule identifier that already exists. */
export class DuplicateRuleError extends Error {
  /** Identifier that caused the collision. */
  readonly ruleId: string;
  constructor(ruleId: string) {
    super(`A verification rule with id "${ruleId}" is already registered.`);
    this.name = 'DuplicateRuleError';
    this.ruleId = ruleId;
  }
}

/**
 * In-memory store of {@link VerificationRule} instances.
 * Composition-friendly: hold an instance rather than subclassing.
 */
export class VerificationRegistry {
  private readonly rulesById = new Map<string, VerificationRule<never>>();
  private readonly idsByKind = new Map<VerificationTargetKind, Set<string>>();

  /**
   * Store a rule.
   * @throws {DuplicateRuleError} when the identifier already exists.
   * @throws {Error} when the rule does not satisfy the contract.
   */
  register<T>(rule: VerificationRule<T>): VerificationRule<T> {
    assertRuleShape(rule as VerificationRule);
    if (this.rulesById.has(rule.id)) throw new DuplicateRuleError(rule.id);
    this.rulesById.set(rule.id, rule as unknown as VerificationRule<never>);
    let kindSet = this.idsByKind.get(rule.targetKind);
    if (!kindSet) {
      kindSet = new Set();
      this.idsByKind.set(rule.targetKind, kindSet);
    }
    kindSet.add(rule.id);
    return rule;
  }

  /** Register several rules in order. Stops at the first duplicate. */
  registerAll(rules: readonly VerificationRule<never>[]): void {
    for (const rule of rules) this.register(rule);
  }

  /**
   * Remove a rule by identifier.
   * @returns true when a rule was removed.
   */
  unregister(ruleId: string): boolean {
    const existing = this.rulesById.get(ruleId);
    if (!existing) return false;
    const kindSet = this.idsByKind.get(existing.targetKind);
    if (kindSet) {
      kindSet.delete(ruleId);
      if (kindSet.size === 0) this.idsByKind.delete(existing.targetKind);
    }
    return this.rulesById.delete(ruleId);
  }

  /** Retrieve a rule by identifier. O(1). */
  get(ruleId: string): VerificationRule<never> | undefined {
    return this.rulesById.get(ruleId);
  }

  /** Whether a rule with the given identifier exists. O(1). */
  has(ruleId: string): boolean {
    return this.rulesById.has(ruleId);
  }

  /** List every registered rule, sorted by identifier for deterministic order. */
  list(): readonly VerificationRule<never>[] {
    return Array.from(this.rulesById.values()).sort(compareRules);
  }

  /** List rules accepting a specific target kind, sorted by identifier. */
  listByKind(kind: VerificationTargetKind): readonly VerificationRule<never>[] {
    const ids = this.idsByKind.get(kind);
    if (!ids) return [];
    const output: VerificationRule<never>[] = [];
    for (const id of ids) {
      const rule = this.rulesById.get(id);
      if (rule) output.push(rule);
    }
    return output.sort(compareRules);
  }

  /** List rules belonging to a specific category, sorted by identifier. */
  listByCategory(category: VerificationCategory): readonly VerificationRule<never>[] {
    return this.list().filter((rule) => rule.category === category);
  }

  /** List every registered identifier, sorted. */
  ids(): readonly string[] {
    return this.list().map((rule) => rule.id);
  }

  /** Remove every registered rule. */
  clear(): void {
    this.rulesById.clear();
    this.idsByKind.clear();
  }

  /** Number of registered rules. */
  size(): number {
    return this.rulesById.size;
  }
}
