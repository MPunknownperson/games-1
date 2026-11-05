/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationLogger.ts is an independent, timestamped logger dedicated to the
 * generation pipeline. It supports leveled output, per-message categories, and
 * timing helpers used by backends and the coordinator. Kept separate from the
 * foundation logger so the generator remains a self-contained module.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Severity of a single log entry. */
export type GenerationLogLevel = 'info' | 'warning' | 'error' | 'debug';

/** A single immutable log record. */
export interface GenerationLogEntry {
  readonly level: GenerationLogLevel;
  readonly category: string;
  readonly message: string;
  /** Epoch milliseconds when the entry was recorded. */
  readonly timestamp: number;
  /** Elapsed duration attached to timing entries, in milliseconds. */
  readonly durationMs?: number;
}

/** A destination that receives formatted log entries. */
export interface GenerationLogSink {
  write(entry: GenerationLogEntry): void;
}

/** Options accepted by {@link GenerationLogger}. */
export interface GenerationLoggerOptions {
  verbose?: boolean;
  enabled?: boolean;
  sinks?: GenerationLogSink[];
}

const LEVEL_LABEL: Record<GenerationLogLevel, string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

/** Default sink that formats entries and writes them to the console. */
export class ConsoleGenerationSink implements GenerationLogSink {
  write(entry: GenerationLogEntry): void {
    const time = new Date(entry.timestamp).toISOString();
    const dur = entry.durationMs !== undefined ? ` (${entry.durationMs.toFixed(2)}ms)` : '';
    const line = `[${time}] [${entry.category}] ${LEVEL_LABEL[entry.level]}${dur}: ${entry.message}`;
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warning') console.warn(line);
    else console.log(line);
  }
}

/**
 * Minimal, composable logger. Hold an instance; do not subclass.
 * Every message is timestamped and forwarded to all attached sinks.
 */
export class GenerationLogger {
  private verbose: boolean;
  private enabled: boolean;
  private readonly sinks: GenerationLogSink[];

  constructor(options: GenerationLoggerOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.enabled = options.enabled ?? true;
    this.sinks = options.sinks ? [...options.sinks] : [new ConsoleGenerationSink()];
  }

  /** Record an informational message. */
  info(category: string, message: string): void {
    this.write({ level: 'info', category, message, timestamp: Date.now() });
  }

  /** Record a warning. */
  warning(category: string, message: string): void {
    this.write({ level: 'warning', category, message, timestamp: Date.now() });
  }

  /** Record an error. */
  error(category: string, message: string): void {
    this.write({ level: 'error', category, message, timestamp: Date.now() });
  }

  /** Record a debug message (only when verbose is enabled). */
  debug(category: string, message: string): void {
    if (this.verbose) this.write({ level: 'debug', category, message, timestamp: Date.now() });
  }

  /**
   * Start a timer for the given category and label.
   *
   * The returned function stops the timer, records a debug entry annotated
   * with the elapsed duration in milliseconds, and returns that duration.
   */
  time(category: string, label: string): () => number {
    const started = nowMs();
    return () => {
      const elapsed = nowMs() - started;
      if (this.verbose) {
        this.write({ level: 'debug', category, message: label, timestamp: Date.now(), durationMs: elapsed });
      }
      return elapsed;
    };
  }

  /** Toggle verbose (debug) output. */
  setVerbose(value: boolean): void {
    this.verbose = value;
  }

  /** Enable or disable all output. */
  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  /** Attach an additional sink. */
  addSink(sink: GenerationLogSink): void {
    this.sinks.push(sink);
  }

  /** Whether the logger is currently emitting debug-level entries. */
  isVerbose(): boolean {
    return this.verbose;
  }

  private write(entry: GenerationLogEntry): void {
    if (!this.enabled) return;
    for (const sink of this.sinks) sink.write(entry);
  }
}

/** High-resolution timestamp with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
