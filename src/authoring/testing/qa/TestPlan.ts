/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestPlan.ts is a deterministic, ordered collection of TestCase objects
 * supporting addition, removal, dependency validation, and serialization.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  compareTestCases,
  type TestCase,
} from './TestCase';
import type { TestCategory, TestMetadata, TestScope } from './TestingTypes';

/** Dependency validation outcome. */
export interface PlanValidationResult {
  readonly valid: boolean;
  readonly missingDependencies: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly errors: readonly string[];
}

/** JSON-serializable snapshot of a test plan. */
export interface TestPlanData {
  readonly planId: string;
  readonly createdAt: string;
  readonly scope: TestScope;
  readonly metadata: TestMetadata;
  readonly testCases: readonly TestCase[];
}

/** Options for constructing a test plan. */
export interface TestPlanOptions {
  planId?: string;
  createdAt?: string;
  scope?: TestScope;
  metadata?: TestMetadata;
  testCases?: readonly TestCase[];
}

/**
 * Deterministic collection of test definitions.
 * Composition-friendly: instantiate per QA session.
 */
export class TestPlan {
  readonly planId: string;
  readonly createdAt: string;
  readonly scope: TestScope;
  readonly metadata: TestMetadata;
  private readonly cases = new Map<string, TestCase>();

  constructor(options: TestPlanOptions = {}) {
    this.planId = options.planId ?? `qa_plan_${Date.now().toString(36)}`;
    this.createdAt = options.createdAt ?? new Date().toISOString();
    this.scope = options.scope ?? 'STANDARD';
    this.metadata = options.metadata ?? {};
    if (options.testCases) for (const tc of options.testCases) this.addTest(tc);
  }

  /** Add or replace a test case. */
  addTest(tc: TestCase): void { this.cases.set(tc.id, tc); }

  /** Remove a test case by identifier. */
  removeTest(id: string): boolean { return this.cases.delete(id); }

  /** Retrieve a test case by identifier. O(1). */
  getTest(id: string): TestCase | undefined { return this.cases.get(id); }

  /** Whether a test case with the given identifier exists. */
  hasTest(id: string): boolean { return this.cases.has(id); }

  /** Number of test cases. */
  testCount(): number { return this.cases.size; }

  /** List all test cases, sorted by category then id. */
  listTests(): readonly TestCase[] {
    return Array.from(this.cases.values()).sort(compareTestCases);
  }

  /** List tests belonging to a specific category. */
  listByCategory(category: TestCategory): readonly TestCase[] {
    return this.listTests().filter((tc) => tc.category === category);
  }

  /** Validate dependencies and detect duplicates. */
  validate(): PlanValidationResult {
    const ids = new Set<string>();
    const duplicates: string[] = [];
    const missing: string[] = [];
    const errors: string[] = [];
    for (const tc of this.cases.values()) {
      if (ids.has(tc.id)) { duplicates.push(tc.id); errors.push(`Duplicate id: ${tc.id}`); }
      ids.add(tc.id);
    }
    for (const tc of this.cases.values()) {
      for (const dep of tc.dependencies ?? []) {
        if (!this.cases.has(dep)) {
          missing.push(`${tc.id} -> ${dep}`);
          errors.push(`Test "${tc.id}" depends on missing test "${dep}".`);
        }
      }
    }
    return { valid: errors.length === 0, missingDependencies: missing, duplicateIds: duplicates, errors };
  }

  /** Clear all test cases. */
  clear(): void { this.cases.clear(); }

  /** Return a plain, JSON-serializable snapshot. */
  toJSON(): Readonly<TestPlanData> {
    return {
      planId: this.planId,
      createdAt: this.createdAt,
      scope: this.scope,
      metadata: this.metadata,
      testCases: this.listTests(),
    };
  }

  /** Serialize the plan to a deterministic JSON string. */
  serialize(pretty = true): string { return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0); }

  /** Rebuild a plan from serialized data. */
  static fromData(data: TestPlanData): TestPlan {
    return new TestPlan({ planId: data.planId, createdAt: data.createdAt, scope: data.scope, metadata: data.metadata, testCases: data.testCases });
  }
}
