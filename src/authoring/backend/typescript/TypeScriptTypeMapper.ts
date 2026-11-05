/**
 * PRESERVE Authoring System — TypeScript Backend.
 *
 * TypeScriptTypeMapper.ts converts language-agnostic IR type descriptors
 * into valid TypeScript type expression strings. It supports primitive types
 * (string, number, boolean, null, void, any, unknown), arrays, generic
 * parameters, and custom references. It contains no gameplay-specific types.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ParameterDescriptor } from '../../ir/IRDeclaration';
import type { ExpressionDescriptor } from '../../ir/IRExpression';
import type { LiteralDescriptor } from '../../ir/IRLiteral';
import type { PrimitiveTypeName, TypeDescriptor } from '../../ir/IRTypes';
import type { QuoteStyle } from './TypeScriptBackendConfig';

/** Primitive type mappings from IR to TypeScript syntax. */
const PRIMITIVE_MAP: Readonly<Record<PrimitiveTypeName, string>> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  void: 'void',
  any: 'any',
  unknown: 'unknown',
};

/**
 * Maps IR type descriptors, expressions, literals, and parameter lists
 * to TypeScript syntax strings.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class TypeScriptTypeMapper {
  private readonly quoteStyle: QuoteStyle;

  constructor(quoteStyle: QuoteStyle = 'single') {
    this.quoteStyle = quoteStyle;
  }

  /** Convert an IR type descriptor into a TypeScript type expression string. */
  mapType(descriptor: TypeDescriptor | undefined): string {
    if (!descriptor) return 'any';
    const base = this.resolveBaseType(descriptor);
    const withGenerics = this.applyGenerics(base, descriptor.genericArguments);
    const withArray = descriptor.isArray ? `${withGenerics}[]` : withGenerics;
    return descriptor.isOptional ? `${withArray} | undefined` : withArray;
  }

  /** Format a property or parameter annotation (e.g. `?: string`). */
  formatAnnotation(descriptor: TypeDescriptor | undefined, isOptional = false): string {
    const typeStr = this.mapType(descriptor);
    return isOptional ? `?: ${typeStr}` : `: ${typeStr}`;
  }

  /** Convert parameter descriptors into a formatted parameter list string. */
  formatParameters(params?: readonly ParameterDescriptor[]): string {
    if (!params || params.length === 0) return '';
    return params.map((p) => {
      const opt = p.optional ? '?' : '';
      const typeStr = p.type ? `: ${this.mapType(p.type)}` : '';
      const def = p.defaultValue ? ` = ${this.formatExpression(p.defaultValue)}` : '';
      return `${p.name}${opt}${typeStr}${def}`;
    }).join(', ');
  }

  /** Convert an expression descriptor into a TypeScript syntax string. */
  formatExpression(expr?: ExpressionDescriptor): string {
    if (!expr) return '';
    if ('literalValue' in expr) return this.formatLiteral(expr.literalValue);
    if ('variableName' in expr) return expr.variableName;
    if ('functionReference' in expr) {
      const args = expr.arguments.map((a) => this.formatExpression(a)).join(', ');
      return `${expr.functionReference}(${args})`;
    }
    if ('operator' in expr && 'left' in expr && 'right' in expr) {
      return this.formatBinaryOp(expr.operator, this.formatExpression(expr.left), this.formatExpression(expr.right));
    }
    if ('operator' in expr && 'operand' in expr) {
      const opMap: Record<string, string> = { not: '!', subtract: '-' };
      return `${opMap[expr.operator] ?? expr.operator}${this.formatExpression(expr.operand)}`;
    }
    if ('base' in expr && 'property' in expr) {
      return `${this.formatExpression(expr.base)}.${expr.property}`;
    }
    if ('expression' in expr && 'targetType' in expr) {
      return `${this.formatExpression(expr.expression)} as ${expr.targetType}`;
    }
    return '';
  }

  /** Convert a literal descriptor into a TypeScript syntax string. */
  formatLiteral(literal?: LiteralDescriptor): string {
    if (!literal) return 'undefined';
    switch (literal.kind) {
      case 'string': {
        const q = this.quoteStyle === 'double' ? '"' : "'";
        return `${q}${String(literal.value ?? '')}${q}`;
      }
      case 'number':
      case 'boolean':
        return String(literal.value);
      case 'null':
        return 'null';
      case 'array': {
        const arr = Array.isArray(literal.value) ? literal.value as LiteralDescriptor[] : [];
        return `[${arr.map((item) => this.formatLiteral(item)).join(', ')}]`;
      }
      case 'object': {
        const obj = literal.value && typeof literal.value === 'object' && !Array.isArray(literal.value) ? literal.value as Record<string, LiteralDescriptor> : {};
        const pairs = Object.entries(obj).map(([k, v]) => `${k}: ${this.formatLiteral(v)}`);
        return `{ ${pairs.join(', ')} }`;
      }
    }
  }

  private formatBinaryOp(operator: string, left: string, right: string): string {
    const opMap: Record<string, string> = {
      add: '+', subtract: '-', multiply: '*', divide: '/', modulo: '%',
      equal: '===', notEqual: '!==', greater: '>', less: '<', and: '&&', or: '||',
    };
    const op = opMap[operator] ?? operator;
    return `${left} ${op} ${right}`;
  }

  private resolveBaseType(descriptor: TypeDescriptor): string {
    const name = descriptor.typeName.trim();
    if (name in PRIMITIVE_MAP) return PRIMITIVE_MAP[name as PrimitiveTypeName];
    return name.length > 0 ? name : 'any';
  }

  private applyGenerics(baseType: string, generics?: readonly TypeDescriptor[]): string {
    if (!generics || generics.length === 0) return baseType;
    const args = generics.map((arg) => this.mapType(arg)).join(', ');
    return `${baseType}<${args}>`;
  }
}
