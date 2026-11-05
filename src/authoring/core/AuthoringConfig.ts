/**
 * PRESERVE Authoring System — configuration container.
 *
 * Holds configurable options for an authoring session. Defaults live in a named
 * constant and are never hardcoded at usage sites. Values may be overridden at
 * construction time or adjusted later. Authoring-only.
 */
import type { AuthoringConfigOptions } from '../types/AuthoringTypes';

/**
 * Default configuration for a new authoring session.
 * Override individual fields via the {@link AuthoringConfig} constructor.
 */
export const DEFAULT_AUTHORING_CONFIG: Readonly<AuthoringConfigOptions> = {
  debug: false,
  verboseLogging: false,
  previewMode: false,
  developmentMode: true,
  experimentalFeatures: false,
};

/**
 * Typed accessor around {@link AuthoringConfigOptions}.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class AuthoringConfig {
  private options: AuthoringConfigOptions;

  constructor(overrides?: Partial<AuthoringConfigOptions>) {
    this.options = { ...DEFAULT_AUTHORING_CONFIG, ...overrides };
  }

  /** Read a single configuration value. */
  get<K extends keyof AuthoringConfigOptions>(key: K): AuthoringConfigOptions[K] {
    return this.options[key];
  }

  /** Write a single configuration value. */
  set<K extends keyof AuthoringConfigOptions>(key: K, value: AuthoringConfigOptions[K]): void {
    this.options[key] = value;
  }

  /** Merge a partial set of overrides into the current options. */
  merge(partial: Partial<AuthoringConfigOptions>): void {
    this.options = { ...this.options, ...partial };
  }

  /** Return an immutable copy of the current options. */
  snapshot(): Readonly<AuthoringConfigOptions> {
    return { ...this.options };
  }
}
