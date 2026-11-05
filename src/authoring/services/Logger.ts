/**
 * PRESERVE Authoring System — lightweight logger.
 *
 * Timestamped, level-based logging with pluggable sinks. A console sink is used
 * by default; additional sinks (e.g. a future file sink) can be attached
 * without changing call sites. This file is authoring-only.
 */
import type { LogLevel } from '../types/AuthoringTypes';

/** A single, immutable log record. */
export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  /** Epoch milliseconds when the entry was created. */
  readonly timestamp: number;
  /** Optional logical scope (e.g. the module name). */
  readonly scope?: string;
}

/** A destination that receives formatted log entries. */
export interface LogSink {
  write(entry: LogEntry): void;
}

/** Options controlling logger behavior. */
export interface LoggerOptions {
  /** Logical scope prefix applied to every entry. */
  scope?: string;
  /** When true, debug-level messages are emitted. */
  verbose?: boolean;
  /** When false, the logger suppresses all output. */
  enabled?: boolean;
  /** Initial sinks; defaults to a single console sink. */
  sinks?: LogSink[];
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
  success: 'OK',
  debug: 'DEBUG',
};

/** Default sink that formats entries and writes them to the console. */
export class ConsoleLogSink implements LogSink {
  write(entry: LogEntry): void {
    const time = new Date(entry.timestamp).toISOString();
    const scope = entry.scope ? ` [${entry.scope}]` : '';
    const line = `[${time}]${scope} ${LEVEL_LABEL[entry.level]}: ${entry.message}`;
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warning') console.warn(line);
    else console.log(line);
  }
}

/**
 * Minimal, composable logger. Hold an instance; do not subclass.
 * Every message is timestamped and forwarded to all attached sinks.
 */
export class Logger {
  private readonly scope?: string;
  private verbose: boolean;
  private enabled: boolean;
  private readonly sinks: LogSink[];

  constructor(options: LoggerOptions = {}) {
    this.scope = options.scope;
    this.verbose = options.verbose ?? false;
    this.enabled = options.enabled ?? true;
    this.sinks = options.sinks ? [...options.sinks] : [new ConsoleLogSink()];
  }

  /** Log an informational message. */
  info(message: string): void {
    this.write('info', message);
  }

  /** Log a warning. */
  warning(message: string): void {
    this.write('warning', message);
  }

  /** Log an error. */
  error(message: string): void {
    this.write('error', message);
  }

  /** Log a success message. */
  success(message: string): void {
    this.write('success', message);
  }

  /** Log a debug message (only when verbose is enabled). */
  debug(message: string): void {
    if (this.verbose) this.write('debug', message);
  }

  /** Toggle verbose (debug) output. */
  setVerbose(value: boolean): void {
    this.verbose = value;
  }

  /** Enable or disable all output. */
  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  /** Attach an additional sink (e.g. a future file sink). */
  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  private write(level: LogLevel, message: string): void {
    if (!this.enabled) return;
    const entry: LogEntry = { level, message, timestamp: Date.now(), scope: this.scope };
    for (const sink of this.sinks) sink.write(entry);
  }
}
