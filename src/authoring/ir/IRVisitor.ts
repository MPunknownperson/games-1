/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRVisitor.ts defines the visitor interface used by every future language
 * backend. Backends traverse IR trees uniformly through this interface,
 * ensuring consistent traversal behavior regardless of target language.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { IRNode } from './IRNode';
import type { DeclarationDescriptor } from './IRDeclaration';
import type { ModuleDescriptor } from './IRModule';
import type { ExpressionDescriptor } from './IRExpression';

/**
 * The base visitor contract. Every language backend provides a class or
 * object implementing these visit methods. Backends may extend or compose
 * this interface, but this contract is the common traversal surface.
 */
export interface IRVisitor {
  /** Called before traversing any node. */
  visit?(node: IRNode): void;

  /** Visit a module descriptor. */
  visitModule?(descriptor: ModuleDescriptor): void;

  /** Visit a declaration descriptor. */
  visitDeclaration?(descriptor: DeclarationDescriptor): void;

  /** Visit an expression descriptor. */
  visitExpression?(descriptor: ExpressionDescriptor): void;

  /** Called after traversing any node. */
  visitEnd?(node: IRNode): void;
}

/**
 * Helper that applies a visitor to a single node. This is the canonical
 * traversal mechanism used by backends; it is not a full tree walker so
 * that backends retain control over order and depth.
 */
export function visitNode(node: IRNode, visitor: IRVisitor): void {
  if (visitor.visit) visitor.visit(node);
  // Note: full recursive traversal is handled by backends, not by this layer.
  if (visitor.visitEnd) visitor.visitEnd(node);
}
