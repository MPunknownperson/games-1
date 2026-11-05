/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRDeclaration.ts defines structural declarations: modules, namespaces,
 * classes, interfaces, enumerations, and members (properties and methods).
 * Declarations describe form; expressions (see IRExpression) describe value.
 */
import type { AccessModifier } from './IRTypes';
import type { TypeDescriptor } from './IRTypes';
import type { ExpressionDescriptor } from './IRExpression';
import type { ModuleDescriptor } from './IRModule';
import type { NamespaceDescriptor } from './IRNamespace';

/** Descriptor for a class-level declaration. */
export interface ClassDescriptor {
  readonly kind: 'Class';
  readonly name: string;
  readonly extends?: string;
  readonly implements?: readonly string[];
  readonly members: readonly DeclarationDescriptor[];
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
}

/** Descriptor for an interface-level declaration. */
export interface InterfaceDescriptor {
  readonly kind: 'Interface';
  readonly name: string;
  readonly extends?: readonly string[];
  readonly members: readonly DeclarationDescriptor[];
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
}

// ModuleDescriptor and NamespaceDescriptor are imported from IRModule and IRNamespace and re-exported
export type { ModuleDescriptor, NamespaceDescriptor };

/** Descriptor for an enumeration declaration. */
export interface EnumDescriptor {
  readonly kind: 'Enum';
  readonly name: string;
  readonly members: readonly string[];
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
}

/** Descriptor for a variable-level declaration. */
export interface VariableDescriptor {
  readonly kind: 'Variable' | 'Constant';
  readonly name: string;
  readonly type?: TypeDescriptor;
  readonly initialValue?: ExpressionDescriptor;
  readonly access?: AccessModifier;
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
}

/** Descriptor for a function-level declaration. */
export interface FunctionDescriptor {
  readonly kind: 'Function';
  readonly name: string;
  readonly parameters?: readonly ParameterDescriptor[];
  readonly returnType?: TypeDescriptor;
  readonly access?: AccessModifier;
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
  /** A function body is expressed as an expression descriptor (statement-level). */
  readonly body?: ExpressionDescriptor;
}

/** Descriptor for a parameter declaration. */
export interface ParameterDescriptor {
  readonly name: string;
  readonly type?: TypeDescriptor;
  readonly optional?: boolean;
  readonly defaultValue?: ExpressionDescriptor;
  readonly annotations?: readonly string[];
}

/** Descriptor for an import declaration. */
export interface ImportDescriptor {
  readonly kind: 'Import';
  readonly source: string;
  readonly bindings?: readonly ImportBindingDescriptor[];
  readonly annotations?: readonly string[];
}

/** Descriptor for an import binding entry. */
export interface ImportBindingDescriptor {
  readonly name: string;
  readonly alias?: string;
  readonly optional?: boolean;
}

/** Descriptor for an export declaration. */
export interface ExportDescriptor {
  readonly kind: 'Export';
  readonly exportedName?: string;
  readonly exportedAs?: string;
  readonly source?: string;
  readonly annotations?: readonly string[];
}

/** Descriptor for a property-level declaration. */
export interface PropertyDescriptor {
  readonly kind: 'Property';
  readonly name: string;
  readonly propertyType?: TypeDescriptor;
  readonly initialValue?: ExpressionDescriptor;
  readonly access?: AccessModifier;
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
}

/** Descriptor for a method-level declaration. */
export interface MethodDescriptor {
  readonly kind: 'Method';
  readonly name: string;
  readonly parameters?: readonly ParameterDescriptor[];
  readonly returnType?: TypeDescriptor;
  readonly access?: AccessModifier;
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
  readonly body?: ExpressionDescriptor;
}

/** Descriptor for a comment declaration (comments as nodes). */
export interface CommentDescriptor {
  readonly kind: 'Comment';
  readonly text: string;
  readonly tags?: readonly string[];
}

/** Descriptor for an annotation-level declaration. */
export interface AnnotationDescriptor {
  readonly kind: 'Annotation';
  readonly name: string;
  readonly arguments?: readonly ExpressionDescriptor[];
  readonly target?: string;
  readonly tags?: readonly string[];
}

/** Descriptor for a block-level declaration. */
export interface BlockDescriptor {
  readonly kind: 'Block';
  readonly statements?: readonly ExpressionDescriptor[];
  readonly annotations?: readonly string[];
  readonly tags?: readonly string[];
}

/** Union of all declaration descriptor types used by the IR. */
export type DeclarationDescriptor =
  | ModuleDescriptor
  | NamespaceDescriptor
  | ImportDescriptor
  | ExportDescriptor
  | ClassDescriptor
  | InterfaceDescriptor
  | EnumDescriptor
  | VariableDescriptor
  | ConstantDescriptor
  | PropertyDescriptor
  | MethodDescriptor
  | FunctionDescriptor
  | CommentDescriptor
  | AnnotationDescriptor
  | BlockDescriptor;

/** Alias for the variable descriptor (same underlying shape). */
export interface ConstantDescriptor extends VariableDescriptor {}
