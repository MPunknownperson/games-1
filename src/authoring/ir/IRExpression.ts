/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRExpression.ts defines language-agnostic expression structures used in
 * fields, declarations, and annotations. Expressions reference variables,
 * invoke functions, apply operators, and construct structures, all without
 * syntax emission.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */


/** Supported operator kinds for expressions. */
export type OperatorKind = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo' | 'equal' | 'notEqual' | 'greater' | 'less' | 'and' | 'or' | 'not' | 'access' | 'call';

/** Descriptor for a function invocation expression. */
export interface FunctionCallDescriptor {
  readonly functionReference: string;
  readonly arguments: readonly ExpressionDescriptor[];
  readonly optional?: boolean;
}

/** Descriptor for a variable access expression. */
export interface VariableAccessDescriptor {
  readonly variableName: string;
  readonly scope?: string;
}

/** A binary operator expression descriptor. */
export interface BinaryOperatorDescriptor {
  readonly operator: OperatorKind;
  readonly left: ExpressionDescriptor;
  readonly right: ExpressionDescriptor;
}

/** A unary operator expression descriptor. */
export interface UnaryOperatorDescriptor {
  readonly operator: OperatorKind;
  readonly operand: ExpressionDescriptor;
}

/** A literal expression descriptor. Uses the same descriptor as fields. */
export interface LiteralExpressionDescriptor {
  readonly literalValue: import('./IRLiteral').LiteralDescriptor;
}

/** A property access descriptor (e.g., `this.property`). */
export interface PropertyAccessDescriptor {
  readonly base: ExpressionDescriptor;
  readonly property: string;
}

/** A type cast descriptor. */
export interface TypeCastDescriptor {
  readonly expression: ExpressionDescriptor;
  readonly targetType: string;
}

/**
 * Union descriptor for any expression. Backends traverse this uniformly.
 */
export type ExpressionDescriptor = FunctionCallDescriptor | VariableAccessDescriptor | BinaryOperatorDescriptor | UnaryOperatorDescriptor | LiteralExpressionDescriptor | PropertyAccessDescriptor | TypeCastDescriptor;

/** Helper tag types used by future backends to distinguish expression shapes. */
export const EXPRESSION_KIND = {
  FUNCTION_CALL: 'functionCall' as const,
  VARIABLE_ACCESS: 'variableAccess' as const,
  BINARY_OPERATOR: 'binaryOperator' as const,
  UNARY_OPERATOR: 'unaryOperator' as const,
  LITERAL: 'literal' as const,
  PROPERTY_ACCESS: 'propertyAccess' as const,
  TYPE_CAST: 'typeCast' as const,
};

/** Create a function call descriptor. */
export function functionCallDescriptor(name: string, args: readonly ExpressionDescriptor[] = []): FunctionCallDescriptor {
  return { functionReference: name, arguments: [...args] };
}

/** Create a variable access descriptor. */
export function variableAccessDescriptor(name: string, scope?: string): VariableAccessDescriptor {
  return { variableName: name, scope };
}

/** Create a binary operator descriptor. */
export function binaryOperatorDescriptor(operator: OperatorKind, left: ExpressionDescriptor, right: ExpressionDescriptor): BinaryOperatorDescriptor {
  return { operator, left, right };
}

/** Create a unary operator descriptor. */
export function unaryOperatorDescriptor(operator: OperatorKind, operand: ExpressionDescriptor): UnaryOperatorDescriptor {
  return { operator, operand };
}

/** Create a literal expression descriptor from a literal descriptor. */
export function literalExpressionDescriptor(literal: import('./IRLiteral').LiteralDescriptor): LiteralExpressionDescriptor {
  return { literalValue: literal };
}

/** Create a property access descriptor. */
export function propertyAccessDescriptor(base: ExpressionDescriptor, property: string): PropertyAccessDescriptor {
  return { base, property };
}

/** Create a type cast descriptor. */
export function typeCastDescriptor(expression: ExpressionDescriptor, targetType: string): TypeCastDescriptor {
  return { expression, targetType };
}
