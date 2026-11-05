/**
 * PRESERVE Authoring System — shared runtime context.
 *
 * Stores shared runtime information for an authoring session and exposes a
 * read-only view to modules. It delegates module lookups to a
 * {@link ModuleProvider} (the coordinator) instead of importing it directly,
 * keeping the dependency one-directional. Authoring-only.
 */
import type {
  AuthoringBuildMode,
  AuthoringModule,
  ModuleProvider,
  ReadonlyAuthoringContext,
} from '../types/AuthoringTypes';

/** Initialization payload for {@link AuthoringContext}. */
export interface AuthoringContextInit {
  projectRoot: string;
  engineVersion: string;
  buildMode: AuthoringBuildMode;
  debug: boolean;
  language: string;
  theme: string;
  /** Supplies module lookups without a circular dependency on the coordinator. */
  moduleProvider: ModuleProvider;
}

/**
 * Concrete shared context implementing the read-only interface handed to
 * modules. Mutable session fields (debug, language, theme) are reserved for
 * future expansion and adjusted only through explicit setters.
 */
export class AuthoringContext implements ReadonlyAuthoringContext {
  readonly projectRoot: string;
  readonly engineVersion: string;
  readonly buildMode: AuthoringBuildMode;

  private _debug: boolean;
  private _language: string;
  private _theme: string;
  private readonly moduleProvider: ModuleProvider;

  constructor(init: AuthoringContextInit) {
    this.projectRoot = init.projectRoot;
    this.engineVersion = init.engineVersion;
    this.buildMode = init.buildMode;
    this._debug = init.debug;
    this._language = init.language;
    this._theme = init.theme;
    this.moduleProvider = init.moduleProvider;
  }

  /** Whether debug behavior is currently enabled. */
  get debug(): boolean {
    return this._debug;
  }

  /** Current authoring language. */
  get language(): string {
    return this._language;
  }

  /** Current authoring theme identifier. */
  get theme(): string {
    return this._theme;
  }

  /** Update the debug flag (future expansion). */
  setDebug(value: boolean): void {
    this._debug = value;
  }

  /** Update the active language (future expansion). */
  setLanguage(language: string): void {
    this._language = language;
  }

  /** Update the active theme (future expansion). */
  setTheme(theme: string): void {
    this._theme = theme;
  }

  /** Look up a registered module by name. */
  getModule(name: string): AuthoringModule | undefined {
    return this.moduleProvider.getModule(name);
  }

  /** List the names of all registered modules. */
  listModules(): readonly string[] {
    return this.moduleProvider.listModules();
  }
}
