/**
 * PRESERVE Authoring System — testing infrastructure.
 *
 * MockContext.ts provides a fake {@link ReadonlyAuthoringContext} that never
 * touches the real project, filesystem, or coordinator. Future authoring
 * modules can use it to simulate debug mode, theme, language, build mode,
 * project root, engine version, and module lookups.
 *
 * Development-only; never imported by the runtime game.
 */
import type {
  AuthoringBuildMode,
  AuthoringModule,
  ReadonlyAuthoringContext,
} from '../types/AuthoringTypes';

/** Options for constructing a {@link MockContext}. All fields are optional. */
export interface MockContextOptions {
  projectRoot?: string;
  engineVersion?: string;
  buildMode?: AuthoringBuildMode;
  debug?: boolean;
  language?: string;
  theme?: string;
}

/** Sensible, obviously-fake defaults so tests never read real values. */
const MOCK_DEFAULTS: Required<MockContextOptions> = {
  projectRoot: '/mock/project',
  engineVersion: '0.0.0-mock',
  buildMode: 'development',
  debug: false,
  language: 'en',
  theme: 'mock-theme',
};

/**
 * In-memory fake context. All state lives on the instance; setters exist so a
 * test can simulate context mutation after construction.
 */
export class MockContext implements ReadonlyAuthoringContext {
  private projectRootValue: string;
  private engineVersionValue: string;
  private buildModeValue: AuthoringBuildMode;
  private debugValue: boolean;
  private languageValue: string;
  private themeValue: string;
  private readonly modules = new Map<string, AuthoringModule>();

  constructor(options: MockContextOptions = {}) {
    const merged = { ...MOCK_DEFAULTS, ...options };
    this.projectRootValue = merged.projectRoot;
    this.engineVersionValue = merged.engineVersion;
    this.buildModeValue = merged.buildMode;
    this.debugValue = merged.debug;
    this.languageValue = merged.language;
    this.themeValue = merged.theme;
  }

  get projectRoot(): string {
    return this.projectRootValue;
  }
  get engineVersion(): string {
    return this.engineVersionValue;
  }
  get buildMode(): AuthoringBuildMode {
    return this.buildModeValue;
  }
  get debug(): boolean {
    return this.debugValue;
  }
  get language(): string {
    return this.languageValue;
  }
  get theme(): string {
    return this.themeValue;
  }

  /** Simulate toggling debug mode. */
  setDebug(value: boolean): void {
    this.debugValue = value;
  }
  /** Simulate changing the active language. */
  setLanguage(value: string): void {
    this.languageValue = value;
  }
  /** Simulate changing the active theme. */
  setTheme(value: string): void {
    this.themeValue = value;
  }
  /** Simulate changing the build mode. */
  setBuildMode(value: AuthoringBuildMode): void {
    this.buildModeValue = value;
  }
  /** Simulate changing the project root. */
  setProjectRoot(value: string): void {
    this.projectRootValue = value;
  }
  /** Simulate changing the engine version. */
  setEngineVersion(value: string): void {
    this.engineVersionValue = value;
  }

  /** Register a fake module so `getModule`/`listModules` can find it. */
  addModule(module: AuthoringModule): void {
    this.modules.set(module.getName(), module);
  }
  /** Remove a previously added fake module. */
  removeModule(name: string): void {
    this.modules.delete(name);
  }

  /** Look up a registered fake module by name. */
  getModule(name: string): AuthoringModule | undefined {
    return this.modules.get(name);
  }
  /** List the names of all registered fake modules. */
  listModules(): readonly string[] {
    return Array.from(this.modules.keys());
  }
}
