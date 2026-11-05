/**
 * PRESERVE Authoring System — TypeScript Backend.
 *
 * TypeScriptBackend.ts implements the GenerationBackend interface to translate
 * language-agnostic IR structures into valid TypeScript source code.
 * It coordinates the visitor, emitter, import resolver, and formatter.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { GenerationBackend } from '../../generator/GenerationBackend';
import type { GenerationContext } from '../../generator/GenerationContext';
import type { GenerationRequest } from '../../generator/GenerationRequest';
import type { GenerationWriter } from '../../generator/GenerationWriter';
import type { DeclarationDescriptor } from '../../ir/IRDeclaration';
import type { FileDescriptor } from '../../ir/IRFile';
import type { ModuleDescriptor } from '../../ir/IRModule';
import type { NamespaceDescriptor } from '../../ir/IRNamespace';
import type { IRNode } from '../../ir/IRNode';
import { TypeScriptBackendConfig, type TypeScriptBackendConfigOptions } from './TypeScriptBackendConfig';
import { TypeScriptEmitter } from './TypeScriptEmitter';
import { TypeScriptFormatter } from './TypeScriptFormatter';
import { TypeScriptVisitor } from './TypeScriptVisitor';

/**
 * Translates IR structures into TypeScript source code.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class TypeScriptBackend implements GenerationBackend {
  private readonly config: TypeScriptBackendConfig;

  constructor(options?: Partial<TypeScriptBackendConfigOptions>) {
    this.config = new TypeScriptBackendConfig(options);
  }

  /** Access the backend configuration. */
  getConfig(): TypeScriptBackendConfig {
    return this.config;
  }

  /** Stable backend identifier. */
  getName(): string {
    return 'typescript';
  }

  /** Semantic version string of the backend implementation. */
  getVersion(): string {
    return '1.0.0';
  }

  /** Called once before the first generation job. */
  async initialize(): Promise<void> {
    // Stateless backend; no async initialization required.
  }

  /** Called when the backend is shut down or unregistered. */
  async shutdown(): Promise<void> {
    // Stateless backend; no cleanup required.
  }

  /** Whether this backend supports the target language of the request. */
  supports(request: GenerationRequest): boolean {
    const lang = request.targetLanguage.toLowerCase().trim();
    return lang === 'typescript' || lang === 'ts';
  }

  /**
   * Generates TypeScript artifacts for the given request by traversing any
   * IR structures supplied in the request metadata.
   */
  async generate(
    request: GenerationRequest,
    writer: GenerationWriter,
    context: GenerationContext,
  ): Promise<void> {
    context.reportProgress(0.1, 'Initializing TypeScript generation');
    context.cancellation.throwIfCancelled();

    const emitter = new TypeScriptEmitter(this.config);
    const visitor = new TypeScriptVisitor(emitter, this.config);
    const formatter = new TypeScriptFormatter();

    const irInput = this.extractIR(request.metadata);
    context.reportProgress(0.3, 'Traversing IR nodes');

    if (irInput) {
      this.traverseIR(irInput, visitor);
    } else {
      context.logger.warning('typescript', `No IR input found in request metadata for schema "${request.schemaId}".`);
      emitter.emitComment(`Generated empty stub for schema: ${request.schemaId}`);
    }

    context.cancellation.throwIfCancelled();
    context.reportProgress(0.7, 'Resolving imports and formatting output');

    const imports = visitor.getImportResolver().resolve(this.config);
    const bodyLines = emitter.getLines();
    const formattedSource = formatter.formatDocument(imports, bodyLines, this.config);

    const outputPath = this.resolveOutputPath(request);
    writer.writeText(outputPath, formattedSource, 'typescript');
    context.reportProgress(1.0, 'TypeScript generation completed');
  }

  /** Extract IR nodes or descriptors from request metadata. */
  private extractIR(metadata: Readonly<Record<string, unknown>>): unknown {
    if ('ir' in metadata && metadata.ir !== undefined) return metadata.ir;
    if ('file' in metadata && metadata.file !== undefined) return metadata.file;
    if ('module' in metadata && metadata.module !== undefined) return metadata.module;
    if ('declarations' in metadata && metadata.declarations !== undefined) return metadata.declarations;
    if ('nodes' in metadata && metadata.nodes !== undefined) return metadata.nodes;
    if ('kind' in metadata && typeof metadata.kind === 'string') return metadata;
    return undefined;
  }

  /** Traverse whatever IR structure was supplied in metadata. */
  private traverseIR(ir: unknown, visitor: TypeScriptVisitor): void {
    if (Array.isArray(ir)) {
      for (const item of ir) this.traverseSingleIR(item, visitor);
    } else {
      this.traverseSingleIR(ir, visitor);
    }
  }

  /** Dispatch a single IR node or descriptor to the visitor. */
  private traverseSingleIR(item: unknown, visitor: TypeScriptVisitor): void {
    if (!item || typeof item !== 'object' || !('kind' in item)) return;
    const kind = (item as { kind: string }).kind;
    switch (kind) {
      case 'File':
        visitor.visitFile(item as FileDescriptor);
        break;
      case 'Module':
        visitor.visitModule(item as ModuleDescriptor);
        break;
      case 'Namespace':
        visitor.visitNamespace(item as NamespaceDescriptor);
        break;
      default:
        visitor.visitDeclaration(item as DeclarationDescriptor);
        break;
    }
    if ('id' in item && typeof (item as IRNode).id === 'string') {
      visitor.visit(item as IRNode);
    }
  }

  /** Determine the target file path for the generated code. */
  private resolveOutputPath(request: GenerationRequest): string {
    const meta = request.metadata;
    if (typeof meta.filename === 'string' && meta.filename.trim().length > 0) {
      return this.joinPath(request.targetDirectory, meta.filename.trim());
    }
    if (typeof meta.path === 'string' && meta.path.trim().length > 0) {
      return meta.path.trim();
    }
    const safeName = request.schemaId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return this.joinPath(request.targetDirectory, `${safeName}.ts`);
  }

  /** Join directory and filename cleanly without filesystem access. */
  private joinPath(dir: string, file: string): string {
    const cleanDir = dir.replace(/\/+$/, '');
    const cleanFile = file.replace(/^\/+/, '');
    if (!cleanDir || cleanDir === '.') return cleanFile;
    return `${cleanDir}/${cleanFile}`;
  }
}
