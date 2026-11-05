/**
 * PRESERVE Authoring System — Test & QA Evidence Layer.
 *
 * TestEvidenceCollector.ts collects externally supplied quality evidence
 * (build outcomes, type-check results, lint reports, bundle sizes, etc.)
 * and normalizes it into structured TestEvidence objects.
 *
 * It NEVER runs npm, compilers, shell commands, or filesystem operations.
 * External tooling supplies raw data; this collector structures it.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import {
  createTestEvidence,
  TestCategory,
  type TestCategory as TestCategoryType,
  type TestEvidence,
} from './TestingTypes';

/** Raw, loosely-typed data supplied by external tooling. */
export interface RawEvidenceInput {
  readonly category: TestCategoryType;
  readonly passed: boolean;
  readonly measurements?: Record<string, string | number | boolean | null>;
  readonly messages?: readonly string[];
  readonly timestamp?: string;
}

/**
 * Stateful collector that accumulates evidence entries across a QA session.
 * Instance-scoped — no global mutable state.
 */
export class TestEvidenceCollector {
  private readonly collected: TestEvidence[] = [];

  /** Record one piece of externally supplied evidence. */
  add(input: RawEvidenceInput): TestEvidence {
    const evidence = createTestEvidence(
      input.category,
      input.passed,
      input.measurements ?? {},
      { messages: input.messages, timestamp: input.timestamp },
    );
    this.collected.push(evidence);
    return evidence;
  }

  /** Convenience: record a build outcome. */
  addBuildEvidence(
    passed: boolean,
    measurements: Record<string, string | number | boolean | null> = {},
    options: { messages?: readonly string[]; timestamp?: string } = {},
  ): TestEvidence {
    return this.add({ category: TestCategory.BUILD, passed, measurements, ...options });
  }

  /** Convenience: record a type-check outcome. */
  addTypeCheckEvidence(
    passed: boolean,
    measurements: Record<string, string | number | boolean | null> = {},
    options: { messages?: readonly string[]; timestamp?: string } = {},
  ): TestEvidence {
    return this.add({ category: TestCategory.TYPECHECK, passed, measurements, ...options });
  }

  /** Convenience: record a serialization check. */
  addSerializationEvidence(
    passed: boolean,
    measurements: Record<string, string | number | boolean | null> = {},
    options: { messages?: readonly string[]; timestamp?: string } = {},
  ): TestEvidence {
    return this.add({ category: TestCategory.SERIALIZATION, passed, measurements, ...options });
  }

  /** Convenience: record an isolation check. */
  addIsolationEvidence(
    passed: boolean,
    measurements: Record<string, string | number | boolean | null> = {},
    options: { messages?: readonly string[]; timestamp?: string } = {},
  ): TestEvidence {
    return this.add({ category: TestCategory.ISOLATION, passed, measurements, ...options });
  }

  /** Return all collected evidence, in recording order. */
  list(): readonly TestEvidence[] { return [...this.collected]; }

  /** Filter evidence by category. */
  listByCategory(category: TestCategoryType): readonly TestEvidence[] {
    return this.collected.filter((evidence) => evidence.category === category);
  }

  /** Whether any evidence has been collected for the given category. */
  hasCategory(category: TestCategoryType): boolean {
    return this.collected.some((evidence) => evidence.category === category);
  }

  /** Number of collected entries. */
  size(): number { return this.collected.length; }

  /** Remove all collected evidence. */
  clear(): void { this.collected.length = 0; }

  /** Return a plain, JSON-serializable array of evidence. */
  toJSON(): readonly TestEvidence[] { return this.list(); }
}
