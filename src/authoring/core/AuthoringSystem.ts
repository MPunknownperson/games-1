/**
 * PRESERVE Authoring System — central coordinator.
 *
 * Owns module registration, initialization, shutdown, and dependency checks.
 * It wires together the config, context, logger, event bus, and file registry.
 * It deliberately does nothing else — content creation lives in future modules.
 *
 * Dependency direction: authoring may depend on the engine, but the engine,
 * gameplay, and runtime never depend on authoring. Nothing in the shipping app
 * imports this file, so it is excluded from production bundles.
 */
import { AuthoringConfig } from './AuthoringConfig';
import { AuthoringContext } from './AuthoringContext';
import { AuthoringEventBus } from '../events/AuthoringEvents';
import { Logger } from '../services/Logger';
import { FileRegistry } from '../services/FileRegistry';
import type {
  AuthoringBuildMode,
  AuthoringConfigOptions,
  AuthoringLifecycle,
  AuthoringModule,
  ModuleProvider,
  ModuleRegistration,
} from '../types/AuthoringTypes';

/** Construction options for {@link AuthoringSystem}. */
export interface AuthoringSystemOptions {
  projectRoot?: string;
  engineVersion?: string;
  buildMode?: AuthoringBuildMode;
  language?: string;
  theme?: string;
  config?: Partial<AuthoringConfigOptions>;
}

/**
 * Coordinator that manages the authoring module lifecycle. Composition-based:
 * it holds its collaborators rather than inheriting from them.
 */
export class AuthoringSystem implements ModuleProvider {
  private readonly config: AuthoringConfig;
  private readonly events: AuthoringEventBus;
  private readonly files: FileRegistry;
  private readonly logger: Logger;
  private readonly context: AuthoringContext;
  private readonly modules = new Map<string, ModuleRegistration>();
  private lifecycle: AuthoringLifecycle = 'idle';

  constructor(options: AuthoringSystemOptions = {}) {
    this.config = new AuthoringConfig(options.config);
    this.events = new AuthoringEventBus();
    this.files = new FileRegistry();
    this.logger = new Logger({ scope: 'Authoring', verbose: this.config.get('verboseLogging') });
    this.context = new AuthoringContext({
      projectRoot: options.projectRoot ?? '.',
      engineVersion: options.engineVersion ?? 'unknown',
      buildMode: options.buildMode ?? 'development',
      debug: this.config.get('debug'),
      language: options.language ?? 'en',
      theme: options.theme ?? 'default',
      moduleProvider: this,
    });
  }

  /** Shared read/write context for this session. */
  getContext(): AuthoringContext {
    return this.context;
  }

  /** Configuration container for this session. */
  getConfig(): AuthoringConfig {
    return this.config;
  }

  /** Session logger. */
  getLogger(): Logger {
    return this.logger;
  }

  /** Session event bus. */
  getEvents(): AuthoringEventBus {
    return this.events;
  }

  /** Session file metadata registry. */
  getFileRegistry(): FileRegistry {
    return this.files;
  }

  /** Current lifecycle state. */
  getLifecycle(): AuthoringLifecycle {
    return this.lifecycle;
  }

  /** Look up a registered module by name. */
  getModule(name: string): AuthoringModule | undefined {
    return this.modules.get(name)?.module;
  }

  /** List the names of all registered modules. */
  listModules(): readonly string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Register a module. Validates the module shape and rejects duplicates.
   * Registration does not initialize the module; call {@link initialize}.
   */
  registerModule(module: AuthoringModule): void {
    this.assertValidModule(module);
    const name = module.getName();
    if (this.modules.has(name)) {
      throw new Error(`Authoring module "${name}" is already registered.`);
    }
    const version = module.getVersion();
    this.modules.set(name, { module, name, version, initialized: false });
    this.logger.info(`Registered module "${name}" v${version}`);
    this.events.emit('module:registered', { name, version });
  }

  /** Initialize every registered module that has not yet been initialized. */
  async initialize(): Promise<void> {
    if (this.lifecycle === 'ready' || this.lifecycle === 'initializing') return;
    this.lifecycle = 'initializing';
    this.logger.info('Initializing authoring system...');
    for (const registration of this.modules.values()) {
      if (registration.initialized) continue;
      await registration.module.initialize(this.context);
      registration.initialized = true;
      this.logger.success(`Initialized module "${registration.name}"`);
      this.events.emit('module:initialized', { name: registration.name });
    }
    this.lifecycle = 'ready';
    this.events.emit('system:initialized', { moduleCount: this.modules.size });
    this.logger.success('Authoring system ready.');
  }

  /** Shut down every initialized module in reverse registration order. */
  async shutdown(reason?: string): Promise<void> {
    if (this.lifecycle === 'stopped' || this.lifecycle === 'idle') return;
    this.lifecycle = 'shutting-down';
    const registrations = Array.from(this.modules.values()).reverse();
    for (const registration of registrations) {
      if (!registration.initialized) continue;
      await registration.module.shutdown();
      registration.initialized = false;
      this.events.emit('module:shutdown', { name: registration.name });
    }
    this.lifecycle = 'stopped';
    this.events.emit('system:shutdown', { reason });
    this.logger.info('Authoring system shut down.');
  }

  /** Verify a candidate implements the full {@link AuthoringModule} contract. */
  private assertValidModule(module: AuthoringModule): void {
    const missing: string[] = [];
    if (typeof module?.getName !== 'function') missing.push('getName');
    if (typeof module?.getVersion !== 'function') missing.push('getVersion');
    if (typeof module?.initialize !== 'function') missing.push('initialize');
    if (typeof module?.shutdown !== 'function') missing.push('shutdown');
    if (missing.length > 0) {
      throw new Error(`Invalid authoring module. Missing methods: ${missing.join(', ')}`);
    }
  }
}
