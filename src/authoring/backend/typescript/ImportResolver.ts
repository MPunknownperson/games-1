/**
 * PRESERVE Authoring System — TypeScript Backend.
 *
 * ImportResolver.ts collects import requirements, removes duplicates, sorts
 * imports deterministically (by source path, then symbol name), and generates
 * formatted TypeScript import statements based on configuration quote and
 * semicolon preferences.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ImportDescriptor as DeclImportDescriptor } from '../../ir/IRDeclaration';
import type { ImportDescriptor as ModImportDescriptor } from '../../ir/IRModule';
import type { TypeScriptBackendConfig } from './TypeScriptBackendConfig';

/** Internal binding record for an imported symbol. */
export interface ResolvedImportBinding {
  readonly name: string;
  readonly alias?: string;
}

/**
 * Resolves, deduplicates, sorts, and formats TypeScript import statements.
 * Composition-friendly: instantiate per file or generation job.
 */
export class ImportResolver {
  private readonly importsBySource = new Map<string, Map<string, ResolvedImportBinding>>();

  /**
   * Add a single named import binding for a given source module specifier.
   * Duplicate symbol names for the same source are automatically deduplicated.
   */
  addBinding(source: string, name: string, alias?: string): void {
    if (!source || !name) return;
    let bindings = this.importsBySource.get(source);
    if (!bindings) {
      bindings = new Map();
      this.importsBySource.set(source, bindings);
    }
    const key = alias ? `${name} as ${alias}` : name;
    if (!bindings.has(key)) {
      bindings.set(key, { name, alias });
    }
  }

  /** Add a bare import (side-effect import with no named bindings). */
  addBareImport(source: string): void {
    if (!source) return;
    if (!this.importsBySource.has(source)) {
      this.importsBySource.set(source, new Map());
    }
  }

  /**
   * Absorb an IR import descriptor (from either IRDeclaration or IRModule).
   * Extracts source path and bindings if present.
   */
  addDescriptor(descriptor: DeclImportDescriptor | ModImportDescriptor | undefined): void {
    if (!descriptor) return;
    const source = 'source' in descriptor ? descriptor.source : descriptor.sourceModuleId;
    if (!source) return;
    if ('bindings' in descriptor && descriptor.bindings && descriptor.bindings.length > 0) {
      for (const b of descriptor.bindings) {
        this.addBinding(source, b.name, b.alias);
      }
    } else {
      this.addBareImport(source);
    }
  }

  /** Generate sorted, formatted import statements as an array of strings. */
  resolve(config: TypeScriptBackendConfig): readonly string[] {
    const q = config.get('quoteStyle') === 'double' ? '"' : "'";
    const semi = config.get('semicolonStyle') === 'always' ? ';' : '';
    const sortedSources = Array.from(this.importsBySource.keys()).sort((a, b) => a.localeCompare(b));

    const statements: string[] = [];
    for (const source of sortedSources) {
      const bindingsMap = this.importsBySource.get(source);
      if (!bindingsMap || bindingsMap.size === 0) {
        statements.push(`import ${q}${source}${q}${semi}`);
        continue;
      }
      const sortedBindings = Array.from(bindingsMap.values())
        .sort((a, b) => this.compareBindings(a, b))
        .map((b) => (b.alias ? `${b.name} as ${b.alias}` : b.name));
      statements.push(`import { ${sortedBindings.join(', ')} } from ${q}${source}${q}${semi}`);
    }
    return statements;
  }

  /** Clear all accumulated imports. */
  clear(): void {
    this.importsBySource.clear();
  }

  /** Deterministic sorting comparison for bindings. */
  private compareBindings(a: ResolvedImportBinding, b: ResolvedImportBinding): number {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    const aliasA = a.alias ?? '';
    const aliasB = b.alias ?? '';
    return aliasA.localeCompare(aliasB);
  }
}
