/**
 * PRESERVE Authoring System — TypeScript Backend.
 *
 * TypeScriptEmitter.ts builds TypeScript source output from structured
 * emission instructions. It supports classes, interfaces, enums, functions,
 * variables, properties, methods, comments, and raw lines.
 * It never parses IR directly — it only receives emission commands.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { TypeScriptBackendConfig } from './TypeScriptBackendConfig';
import { TypeScriptFormatter } from './TypeScriptFormatter';

/**
 * Builds TypeScript source lines from structured emission instructions.
 * Composition-friendly: hold an instance per file or generation job.
 */
export class TypeScriptEmitter {
  private readonly lines: string[] = [];
  private indentLevel = 0;
  private readonly config: TypeScriptBackendConfig;
  private readonly formatter = new TypeScriptFormatter();

  constructor(config: TypeScriptBackendConfig) {
    this.config = config;
  }

  /** Emit the opening line of a class declaration. */
  emitClassStart(name: string, isExported = true, extendsName?: string, implementsNames?: readonly string[]): void {
    const exp = isExported ? 'export ' : '';
    const ext = extendsName ? ` extends ${extendsName}` : '';
    const imp = implementsNames && implementsNames.length > 0 ? ` implements ${implementsNames.join(', ')}` : '';
    this.appendLine(`${exp}class ${name}${ext}${imp} {`);
    this.increaseIndent();
  }

  /** Emit the closing brace of a class declaration. */
  emitClassEnd(): void {
    this.decreaseIndent();
    this.appendLine('}');
  }

  /** Emit the opening line of an interface declaration. */
  emitInterfaceStart(name: string, isExported = true, extendsNames?: readonly string[]): void {
    const exp = isExported ? 'export ' : '';
    const ext = extendsNames && extendsNames.length > 0 ? ` extends ${extendsNames.join(', ')}` : '';
    this.appendLine(`${exp}interface ${name}${ext} {`);
    this.increaseIndent();
  }

  /** Emit the closing brace of an interface declaration. */
  emitInterfaceEnd(): void {
    this.decreaseIndent();
    this.appendLine('}');
  }

  /** Emit the opening line of an enum declaration. */
  emitEnumStart(name: string, isExported = true): void {
    const exp = isExported ? 'export ' : '';
    this.appendLine(`${exp}enum ${name} {`);
    this.increaseIndent();
  }

  /** Emit a single enum member. */
  emitEnumMember(name: string, value?: string | number): void {
    const comma = this.config.get('trailingCommas') ? ',' : '';
    if (value === undefined) {
      this.appendLine(`${name}${comma}`);
    } else {
      const q = typeof value === 'string' ? (this.config.get('quoteStyle') === 'double' ? '"' : "'") : '';
      this.appendLine(`${name} = ${q}${value}${q}${comma}`);
    }
  }

  /** Emit the closing brace of an enum declaration. */
  emitEnumEnd(): void {
    this.decreaseIndent();
    this.appendLine('}');
  }

  /** Emit the opening line of a function declaration. */
  emitFunctionStart(name: string, paramsStr = '', returnTypeStr?: string, isExported = true, isAsync = false): void {
    const exp = isExported ? 'export ' : '';
    const asyncPfx = isAsync ? 'async ' : '';
    const ret = returnTypeStr ? `: ${returnTypeStr}` : '';
    this.appendLine(`${exp}${asyncPfx}function ${name}(${paramsStr})${ret} {`);
    this.increaseIndent();
  }

  /** Emit the closing brace of a function or method. */
  emitBlockEnd(): void {
    this.decreaseIndent();
    this.appendLine('}');
  }

  /** Emit a variable or constant declaration. */
  emitVariable(name: string, kind: 'Variable' | 'Constant', typeStr?: string, initStr?: string, isExported = false): void {
    const exp = isExported ? 'export ' : '';
    const kw = kind === 'Constant' ? 'const' : 'let';
    const typeAnn = typeStr && this.config.get('emitTypeAnnotations') ? `: ${typeStr}` : '';
    const init = initStr !== undefined ? ` = ${initStr}` : '';
    const semi = this.config.get('semicolonStyle') === 'always' ? ';' : '';
    this.appendLine(`${exp}${kw} ${name}${typeAnn}${init}${semi}`);
  }

  /** Emit a class or interface property declaration. */
  emitProperty(name: string, typeStr?: string, initStr?: string, access = '', isOptional = false, isReadonly = false): void {
    const acc = access ? `${access} ` : '';
    const ro = isReadonly ? 'readonly ' : '';
    const opt = isOptional ? '?' : '';
    const typeAnn = typeStr ? `: ${typeStr}` : '';
    const init = initStr !== undefined ? ` = ${initStr}` : '';
    const semi = this.config.get('semicolonStyle') === 'always' ? ';' : '';
    this.appendLine(`${acc}${ro}${name}${opt}${typeAnn}${init}${semi}`);
  }

  /** Emit a class method start line. */
  emitMethodStart(name: string, paramsStr = '', returnTypeStr?: string, access = '', isStatic = false, isAbstract = false): void {
    const acc = access ? `${access} ` : '';
    const stat = isStatic ? 'static ' : '';
    const abs = isAbstract ? 'abstract ' : '';
    const ret = returnTypeStr ? `: ${returnTypeStr}` : '';
    if (isAbstract) {
      const semi = this.config.get('semicolonStyle') === 'always' ? ';' : '';
      this.appendLine(`${acc}${stat}${abs}${name}(${paramsStr})${ret}${semi}`);
    } else {
      this.appendLine(`${acc}${stat}${name}(${paramsStr})${ret} {`);
      this.increaseIndent();
    }
  }

  /** Emit a comment block or single line comment. */
  emitComment(text: string, isMultiline = false): void {
    if (!text) return;
    if (isMultiline || text.includes('\n')) {
      this.appendLine('/**');
      text.split('\n').forEach((line) => this.appendLine(` * ${line.trim()}`));
      this.appendLine(' */');
    } else {
      this.appendLine(`// ${text.trim()}`);
    }
  }

  /** Emit a raw statement or instruction line. */
  emitRawLine(line: string): void {
    this.appendLine(line);
  }

  /** Emit a blank line for vertical spacing. */
  emitBlankLine(): void {
    if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== '') {
      this.lines.push('');
    }
  }

  /** Increase indentation level. */
  increaseIndent(): void {
    this.indentLevel += 1;
  }

  /** Decrease indentation level (clamped to zero). */
  decreaseIndent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  /** Return the accumulated formatted lines. */
  getLines(): readonly string[] {
    return [...this.lines];
  }

  /** Clear all accumulated lines and reset indentation. */
  clear(): void {
    this.lines.length = 0;
    this.indentLevel = 0;
  }

  private appendLine(line: string): void {
    this.lines.push(this.formatter.formatLine(line, this.indentLevel, this.config));
  }
}
