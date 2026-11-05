/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRNamespace.ts defines namespace-level descriptors. Namespaces are grouping
 * containers that do not themselves hold syntax rules — they organize modules,
 * declarations, and nested namespaces for future backend organization.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { DeclarationDescriptor } from './IRDeclaration';

/** Descriptor for a namespace-level grouping container. */
export interface NamespaceDescriptor {
  readonly kind: 'Namespace';
  /** Name or identifier of the namespace. */
  readonly name: string;
  /** Stable namespace identifier. */
  readonly namespaceId?: string;
  /** Human-facing label. */
  readonly displayName?: string;
  /** Declarations contained by the namespace. */
  readonly members?: readonly DeclarationDescriptor[];
  readonly declarations?: readonly DeclarationDescriptor[];
  readonly annotations?: readonly string[];
  /** Optional documentation describing the namespace. */
  readonly documentation?: string;
  /** Tags for grouping and lookup. */
  readonly tags?: readonly string[];
  /** Metadata about namespace behavior (e.g., visibility). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
