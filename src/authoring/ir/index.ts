/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * Public entry point exposing only the deterministic, language-agnostic
 * interfaces for descriptors, literals, expressions, declarations, modules,
 * files, namespaces, visitors, and serialization.
 */
// Base node identity
export {
  identity,
  type IRIdentity,
  type IRNodeKind,
  type IRNode,
} from './IRNode';

// Shared descriptors and categories
export {
  type AccessModifier,
  type PrimitiveTypeName,
  type DeclarationKindDescriptor,
  type GenericParameterDescriptor,
  type TypeDescriptor,
} from './IRTypes';

// Literal descriptors
export {
  type LiteralDescriptor,
  type LiteralKind,
  literalString,
  literalNumber,
  literalBoolean,
  literalNull,
  literalArray,
  literalObject,
} from './IRLiteral';

// Expression descriptors
export {
  type ExpressionDescriptor,
  type OperatorKind,
  type FunctionCallDescriptor,
  type VariableAccessDescriptor,
  type BinaryOperatorDescriptor,
  type UnaryOperatorDescriptor,
  type LiteralExpressionDescriptor,
  type PropertyAccessDescriptor,
  type TypeCastDescriptor,
  EXPRESSION_KIND,
  functionCallDescriptor,
  variableAccessDescriptor,
  binaryOperatorDescriptor,
  unaryOperatorDescriptor,
  literalExpressionDescriptor,
  propertyAccessDescriptor,
  typeCastDescriptor,
} from './IRExpression';

// Declaration descriptors
export {
  type DeclarationDescriptor,
  type ClassDescriptor,
  type InterfaceDescriptor,
  type VariableDescriptor,
  type ConstantDescriptor,
  type PropertyDescriptor,
  type MethodDescriptor,
  type ParameterDescriptor,
  type FunctionDescriptor,
  type CommentDescriptor,
  type AnnotationDescriptor,
  type BlockDescriptor,
  type ImportDescriptor,
  type ImportBindingDescriptor,
  type ExportDescriptor,
} from './IRDeclaration';

// File descriptor
export { type FileDescriptor } from './IRFile';

// Namespace descriptor
export { type NamespaceDescriptor } from './IRNamespace';

// Visitor contract
export {
  type IRVisitor,
  visitNode,
} from './IRVisitor';

// Serialization
export {
  type SerializationOptions,
  DEFAULT_SERIALIZATION_OPTIONS,
  serializeToJson,
  serializeSchema,
  serializeSchemaCollection,
} from './IRSerializer';
