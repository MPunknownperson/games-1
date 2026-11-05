/**
 * PRESERVE Authoring System — Validation System.
 *
 * ValidatorRegistry.ts stores validators in memory, keyed by identifier, and
 * indexes them by target kind so the runner can select matches in O(1).
 *
 * Every registry instance owns its storage — there is no global mutable state,
 * no filesystem access, and no network access.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { assertValidatorShape, type Validator } from './ValidationRule';
import type { ValidationTargetKind } from './ValidatorTypes';

/** Raised when registering a validator identifier that already exists. */
export class DuplicateValidatorError extends Error {
  /** Identifier that caused the collision. */
  readonly validatorId: string;
  constructor(validatorId: string) {
    super(`A validator with id "${validatorId}" is already registered.`);
    this.name = 'DuplicateValidatorError';
    this.validatorId = validatorId;
  }
}

/**
 * In-memory store of {@link Validator} instances.
 * Composition-friendly: hold an instance rather than subclassing.
 */
export class ValidatorRegistry {
  private readonly validatorsById = new Map<string, Validator<never>>();
  private readonly idsByKind = new Map<ValidationTargetKind, Set<string>>();

  /**
   * Store a validator.
   * @throws {DuplicateValidatorError} when the identifier already exists.
   * @throws {Error} when the validator does not satisfy the contract.
   */
  register<T>(validator: Validator<T>): Validator<T> {
    assertValidatorShape(validator as Validator);
    if (this.validatorsById.has(validator.id)) {
      throw new DuplicateValidatorError(validator.id);
    }
    this.validatorsById.set(validator.id, validator as unknown as Validator<never>);
    let kindSet = this.idsByKind.get(validator.targetKind);
    if (!kindSet) {
      kindSet = new Set();
      this.idsByKind.set(validator.targetKind, kindSet);
    }
    kindSet.add(validator.id);
    return validator;
  }

  /**
   * Remove a validator by identifier.
   * @returns true when an entry was removed.
   */
  unregister(validatorId: string): boolean {
    const existing = this.validatorsById.get(validatorId);
    if (!existing) return false;
    const kindSet = this.idsByKind.get(existing.targetKind);
    if (kindSet) {
      kindSet.delete(validatorId);
      if (kindSet.size === 0) this.idsByKind.delete(existing.targetKind);
    }
    return this.validatorsById.delete(validatorId);
  }

  /** Retrieve a validator by identifier. O(1). */
  get(validatorId: string): Validator<never> | undefined {
    return this.validatorsById.get(validatorId);
  }

  /** Whether a validator with the given identifier exists. O(1). */
  has(validatorId: string): boolean {
    return this.validatorsById.has(validatorId);
  }

  /** List every registered validator, in registration order. */
  list(): readonly Validator<never>[] {
    return Array.from(this.validatorsById.values());
  }

  /** List validators registered for a specific target kind. */
  listByKind(kind: ValidationTargetKind): readonly Validator<never>[] {
    const ids = this.idsByKind.get(kind);
    if (!ids) return [];
    const output: Validator<never>[] = [];
    for (const id of ids) {
      const validator = this.validatorsById.get(id);
      if (validator) output.push(validator);
    }
    return output;
  }

  /** List every registered identifier. */
  ids(): readonly string[] {
    return Array.from(this.validatorsById.keys());
  }

  /** Remove every registered validator. */
  clear(): void {
    this.validatorsById.clear();
    this.idsByKind.clear();
  }

  /** Number of registered validators. */
  size(): number {
    return this.validatorsById.size;
  }
}
