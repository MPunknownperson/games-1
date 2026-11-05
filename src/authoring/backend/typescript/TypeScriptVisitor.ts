/**
 * PRESERVE Authoring System — TypeScript Backend.
 *
 * TypeScriptVisitor.ts traverses language-agnostic IR trees and converts them
 * into TypeScript source code representations using the emitter, type mapper,
 * and import resolver.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type {
  AnnotationDescriptor, BlockDescriptor, ClassDescriptor, CommentDescriptor, ConstantDescriptor,
  DeclarationDescriptor, EnumDescriptor, ExportDescriptor, FunctionDescriptor,
  ImportDescriptor as DeclImportDescriptor, InterfaceDescriptor, MethodDescriptor, ModuleDescriptor,
  NamespaceDescriptor, PropertyDescriptor, VariableDescriptor,
} from '../../ir/IRDeclaration';
import type { ImportDescriptor as ModImportDescriptor } from '../../ir/IRModule';
import type { ExpressionDescriptor } from '../../ir/IRExpression';
import type { FileDescriptor } from '../../ir/IRFile';
import type { IRNode } from '../../ir/IRNode';
import type { IRVisitor } from '../../ir/IRVisitor';
import { ImportResolver } from './ImportResolver';
import type { TypeScriptBackendConfig } from './TypeScriptBackendConfig';
import { TypeScriptEmitter } from './TypeScriptEmitter';
import { TypeScriptTypeMapper } from './TypeScriptTypeMapper';

/**
 * Traverses IR nodes and emits valid TypeScript source code.
 * Composition-friendly: hold an instance per file or generation job.
 */
export class TypeScriptVisitor implements IRVisitor {
  private readonly emitter: TypeScriptEmitter;
  private readonly typeMapper = new TypeScriptTypeMapper();
  private readonly importResolver = new ImportResolver();
  private readonly config: TypeScriptBackendConfig;

  constructor(emitter: TypeScriptEmitter, config: TypeScriptBackendConfig) {
    this.emitter = emitter;
    this.config = config;
  }

  /** Access the import resolver to collect imports during traversal. */
  getImportResolver(): ImportResolver {
    return this.importResolver;
  }

  /** Generic visitor entry point for IRNode. */
  visit(node: IRNode): void {
    if (node.documentation) {
      this.emitter.emitComment(node.documentation, true);
    }
  }

  /** Visit a file descriptor, processing its modules. */
  visitFile(file: FileDescriptor): void {
    if (file.documentation) this.emitter.emitComment(file.documentation, true);
    if (file.modules) {
      for (const mod of file.modules) this.visitModule(mod);
    }
  }

  /** Visit a module descriptor, registering imports and visiting declarations. */
  visitModule(mod: ModuleDescriptor): void {
    if (mod.documentation) this.emitter.emitComment(mod.documentation, true);
    if (mod.imports) {
      for (const imp of mod.imports) this.visitImport(imp);
    }
    if (mod.declarations) {
      for (const decl of mod.declarations) this.visitDeclaration(decl);
    }
  }

  /** Visit a namespace descriptor. */
  visitNamespace(ns: NamespaceDescriptor): void {
    if (ns.documentation) this.emitter.emitComment(ns.documentation, true);
    const exp = !ns.tags?.includes('private') ? 'export ' : '';
    this.emitter.emitRawLine(`${exp}namespace ${ns.name} {`);
    this.emitter.increaseIndent();
    const members = ns.members ?? ns.declarations;
    if (!members || members.length === 0) {
      this.emitter.emitBlankLine();
    } else {
      for (const member of members) this.visitDeclaration(member);
    }
    this.emitter.decreaseIndent();
    this.emitter.emitRawLine('}');
  }

  /** Dispatch declaration descriptors to their specific visitor methods. */
  visitDeclaration(decl: DeclarationDescriptor): void {
    switch (decl.kind) {
      case 'Class': return this.visitClass(decl);
      case 'Interface': return this.visitInterface(decl);
      case 'Enum': return this.visitEnum(decl);
      case 'Function': return this.visitFunction(decl);
      case 'Method': return this.visitMethod(decl);
      case 'Property': return this.visitProperty(decl);
      case 'Variable':
      case 'Constant': return this.visitVariable(decl);
      case 'Import': return this.visitImport(decl);
      case 'Export': return this.visitExport(decl);
      case 'Comment': return this.visitComment(decl);
      case 'Namespace': return this.visitNamespace(decl);
      case 'Module': return this.visitModule(decl);
      case 'Block': return this.visitBlock(decl);
      case 'Annotation': return this.visitAnnotation(decl);
    }
  }

  /** Visit a class declaration. */
  visitClass(cls: ClassDescriptor): void {
    const isExported = !cls.tags?.includes('private') && !cls.tags?.includes('internal');
    this.emitter.emitClassStart(cls.name, isExported, cls.extends, cls.implements);
    if (!cls.members || cls.members.length === 0) {
      this.emitter.emitBlankLine();
    } else {
      for (const member of cls.members) {
        this.visitDeclaration(member);
      }
    }
    this.emitter.emitClassEnd();
  }

  /** Visit an interface declaration. */
  visitInterface(iface: InterfaceDescriptor): void {
    const isExported = !iface.tags?.includes('private') && !iface.tags?.includes('internal');
    this.emitter.emitInterfaceStart(iface.name, isExported, iface.extends);
    if (!iface.members || iface.members.length === 0) {
      this.emitter.emitBlankLine();
    } else {
      for (const member of iface.members) {
        this.visitDeclaration(member);
      }
    }
    this.emitter.emitInterfaceEnd();
  }

  /** Visit an enum declaration. */
  visitEnum(enm: EnumDescriptor): void {
    const isExported = !enm.tags?.includes('private') && !enm.tags?.includes('internal');
    this.emitter.emitEnumStart(enm.name, isExported);
    for (const member of enm.members) {
      this.emitter.emitEnumMember(member);
    }
    this.emitter.emitEnumEnd();
  }

  /** Visit a function declaration. */
  visitFunction(fn: FunctionDescriptor): void {
    const isExported = !fn.tags?.includes('private') && !fn.tags?.includes('internal');
    const isAsync = fn.tags?.includes('async') ?? false;
    const paramsStr = this.typeMapper.formatParameters(fn.parameters);
    const returnStr = fn.returnType ? this.typeMapper.mapType(fn.returnType) : undefined;
    this.emitter.emitFunctionStart(fn.name, paramsStr, returnStr, isExported, isAsync);
    if (!fn.body) {
      this.emitter.emitBlankLine();
    } else {
      this.visitExpression(fn.body);
    }
    this.emitter.emitBlockEnd();
  }

  /** Visit a class interface method declaration. */
  visitMethod(method: MethodDescriptor): void {
    const access = method.access && method.access !== 'public' ? method.access : '';
    const isStatic = method.tags?.includes('static') ?? false;
    const isAbstract = method.tags?.includes('abstract') ?? false;
    const paramsStr = this.typeMapper.formatParameters(method.parameters);
    const returnStr = method.returnType ? this.typeMapper.mapType(method.returnType) : undefined;
    this.emitter.emitMethodStart(method.name, paramsStr, returnStr, access, isStatic, isAbstract);
    if (!isAbstract) {
      if (!method.body) {
        this.emitter.emitBlankLine();
      } else {
        this.visitExpression(method.body);
      }
      this.emitter.emitBlockEnd();
    }
  }

  /** Visit a property declaration. */
  visitProperty(prop: PropertyDescriptor): void {
    const access = prop.access && prop.access !== 'public' ? prop.access : '';
    const isOptional = prop.tags?.includes('optional') ?? false;
    const isReadonly = prop.tags?.includes('readonly') ?? false;
    const typeStr = prop.propertyType ? this.typeMapper.mapType(prop.propertyType) : undefined;
    const initStr = prop.initialValue ? this.typeMapper.formatExpression(prop.initialValue) : undefined;
    this.emitter.emitProperty(prop.name, typeStr, initStr, access, isOptional, isReadonly);
  }

  /** Visit a variable or constant declaration. */
  visitVariable(varDecl: VariableDescriptor | ConstantDescriptor): void {
    const isExported = varDecl.tags?.includes('export') ?? false;
    const typeStr = varDecl.type ? this.typeMapper.mapType(varDecl.type) : undefined;
    const initStr = varDecl.initialValue ? this.typeMapper.formatExpression(varDecl.initialValue) : undefined;
    this.emitter.emitVariable(varDecl.name, varDecl.kind, typeStr, initStr, isExported);
  }

  /** Visit an import declaration and register it with the import resolver. */
  visitImport(imp: DeclImportDescriptor | ModImportDescriptor): void {
    this.importResolver.addDescriptor(imp);
  }

  /** Visit an export declaration. */
  visitExport(exp: ExportDescriptor): void {
    const semi = this.config.get('semicolonStyle') === 'always' ? ';' : '';
    if (exp.source) {
      const name = exp.exportedName ?? '*';
      const asAlias = exp.exportedAs ? ` as ${exp.exportedAs}` : '';
      const q = this.config.get('quoteStyle') === 'double' ? '"' : "'";
      this.emitter.emitRawLine(`export { ${name}${asAlias} } from ${q}${exp.source}${q}${semi}`);
    } else if (exp.exportedName) {
      const asAlias = exp.exportedAs ? ` as ${exp.exportedAs}` : '';
      this.emitter.emitRawLine(`export { ${exp.exportedName}${asAlias} }${semi}`);
    }
  }

  /** Visit a comment node. */
  visitComment(comm: CommentDescriptor): void {
    this.emitter.emitComment(comm.text, comm.text.includes('\n'));
  }

  /** Visit a code block. */
  visitBlock(blk: BlockDescriptor): void {
    if (blk.statements) {
      for (const stmt of blk.statements) this.visitExpression(stmt);
    }
  }

  /** Visit an annotation (decorator). */
  visitAnnotation(ann: AnnotationDescriptor): void {
    const argsStr = ann.arguments ? ann.arguments.map((a) => this.typeMapper.formatExpression(a)).join(', ') : '';
    this.emitter.emitRawLine(`@${ann.name}(${argsStr})`);
  }

  /** Visit an expression statement. */
  visitExpression(expr: ExpressionDescriptor): void {
    const formatted = this.typeMapper.formatExpression(expr);
    if (formatted) {
      const semi = this.config.get('semicolonStyle') === 'always' ? ';' : '';
      this.emitter.emitRawLine(`${formatted}${semi}`);
    }
  }
}
