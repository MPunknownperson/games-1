/**
 * PRESERVE Authoring System — TypeScript Backend.
 *
 * TypeScriptBackendConfig.ts defines configurable options for TypeScript
 * code generation: indentation, quote style, semicolon usage, line endings,
 * and target version. No formatting rules are hardcoded in the emitter or
 * formatter; all formatting derives from this configuration.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Quote styles supported when emitting strings and imports. */
export type QuoteStyle = 'single' | 'double';

/** Line ending styles supported when emitting formatted text. */
export type NewlineStyle = 'lf' | 'crlf';

/** Semicolon usage styles when terminating statements and declarations. */
export type SemicolonStyle = 'always' | 'never';

/** ECMAScript target language versions for generated TypeScript syntax. */
export type TypeScriptTargetVersion = 'ES2020' | 'ES2021' | 'ES2022' | 'ESNext';

/** Configurable formatting and syntax options for TypeScript generation. */
export interface TypeScriptBackendConfigOptions {
  /** Number of spaces (or tabs) per indentation level. Defaults to 2. */
  readonly indentSize: number;
  /** Whether to use spaces or tabs for indentation. Defaults to true (spaces). */
  readonly useSpaces: boolean;
  /** Quote style for string literals and module specifiers. Defaults to 'single'. */
  readonly quoteStyle: QuoteStyle;
  /** Whether to append semicolons to statements and properties. Defaults to 'always'. */
  readonly semicolonStyle: SemicolonStyle;
  /** Line ending sequence used when separating lines. Defaults to 'lf'. */
  readonly newlineStyle: NewlineStyle;
  /** Target TypeScript / ECMAScript syntax profile. Defaults to 'ESNext'. */
  readonly targetVersion: TypeScriptTargetVersion;
  /** Whether to emit type annotations on variable declarations. Defaults to true. */
  readonly emitTypeAnnotations: boolean;
  /** Whether to append trailing commas in multiline structures. Defaults to true. */
  readonly trailingCommas: boolean;
}

/** Default configuration values for the TypeScript backend. */
export const DEFAULT_TYPESCRIPT_CONFIG: Readonly<TypeScriptBackendConfigOptions> = {
  indentSize: 2,
  useSpaces: true,
  quoteStyle: 'single',
  semicolonStyle: 'always',
  newlineStyle: 'lf',
  targetVersion: 'ESNext',
  emitTypeAnnotations: true,
  trailingCommas: true,
};

/**
 * Configuration container for the TypeScript backend.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class TypeScriptBackendConfig {
  private options: TypeScriptBackendConfigOptions;

  constructor(overrides?: Partial<TypeScriptBackendConfigOptions>) {
    this.options = { ...DEFAULT_TYPESCRIPT_CONFIG, ...overrides };
  }

  /** Read a single configuration option. */
  get<K extends keyof TypeScriptBackendConfigOptions>(key: K): TypeScriptBackendConfigOptions[K] {
    return this.options[key];
  }

  /** Write a single configuration option. */
  set<K extends keyof TypeScriptBackendConfigOptions>(key: K, value: TypeScriptBackendConfigOptions[K]): void {
    this.options = { ...this.options, [key]: value };
  }

  /** Merge partial overrides into the configuration. */
  merge(partial: Partial<TypeScriptBackendConfigOptions>): void {
    this.options = { ...this.options, ...partial };
  }

  /** Return an immutable snapshot of the current configuration. */
  snapshot(): Readonly<TypeScriptBackendConfigOptions> {
    return { ...this.options };
  }
}
