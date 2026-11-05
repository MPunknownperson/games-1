/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRModule.ts defines the top-level container descriptor. A module is a named,
 * documented structural unit that groups namespaces, declarations, and imports.
 * It carries no syntax, no formatting, and no language emission rules.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { DeclarationDescriptor } from './IRDeclaration';

/**
 * Descriptor for a module — the top-level organizational unit in an IR tree.
 */
export interface ModuleDescriptor {
  readonly kind: 'Module';
  /** Stable identifier for the module. */
  readonly name: string;
  /** Human-facing label, separate from the machine identifier. */
  readonly displayName?: string;
  /** Long-form explanation of the module's purpose. */
  readonly documentation?: string;
  /** Tags for grouping and lookup. */
  readonly tags?: readonly string[];
  /** Declarations contained directly by the module. */
  readonly declarations?: readonly DeclarationDescriptor[];
  /** Import descriptors describing external module dependencies. */
  readonly imports?: readonly ImportDescriptor[];
  /** Re-export descriptors describing what the module exposes. */
  readonly exports?: readonly ExportDescriptor[];
  readonly annotations?: readonly string[];
  /** Optional metadata about build settings or external references. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Descriptor for an import dependency. References another module by stable id.
 * The import descriptor does not emit syntax; it only describes the dependency
 * relationship for generators and future validators.
 */
export interface ImportDescriptor {
  readonly kind: 'Import';
  /** Stable identifier of the module being imported. */
  readonly sourceModuleId: string;
  /** Optional descriptive label for the dependency. */
  readonly label?: string;
  /** Tags describing the purpose of the import. */
  readonly tags?: readonly string[];
  /** Optional documentation for the dependency. */
  readonly documentation?: string;
  /** Whether this import is advisory (optional) or required. */
  readonly optional?: boolean;
}

/**
 * Descriptor for an export descriptor. Describes what a module exposes.
 * This is pure metadata; emission rules belong to backend generators.
 */
export interface ExportDescriptor {
  readonly kind: 'Export';
  /** Stable identifier of the declaration being exported, when applicable. */
  readonly exportedDeclarationId?: string;
  /** Human-facing label for the exported symbol or group. */
  readonly exportedName?: string;
  /** Optional documentation describing the export. */
  readonly documentation?: string;
  /** Whether the export is visible externally or internal. */
  readonly public?: boolean;
}
