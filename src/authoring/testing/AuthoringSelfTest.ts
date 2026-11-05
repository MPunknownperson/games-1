/**
 * PRESERVE Authoring System — testing infrastructure.
 *
 * AuthoringSelfTest.ts is a built-in validation suite. It uses the testing
 * framework to verify the authoring foundation itself: module initialization,
 * duplicate registration, module shutdown, configuration loading, context
 * mutation, logger output, and registry operations.
 *
 * Run it during development via `runAuthoringSelfTest()`. Nothing in the
 * runtime game imports this file, so it never ships to production.
 */
import { AuthoringSystem } from '../core/AuthoringSystem';
import { AuthoringConfig, DEFAULT_AUTHORING_CONFIG } from '../core/AuthoringConfig';
import { FileRegistry } from '../services/FileRegistry';
import { Logger, type LogEntry, type LogSink } from '../services/Logger';
import type { AuthoringModule } from '../types/AuthoringTypes';

import { defineTest } from './AuthoringTest';
import { AuthoringTestRunner } from './AuthoringTestRunner';
import {
  assertArrayLength,
  assertDefined,
  assertEqual,
  assertFalse,
  assertNotEqual,
  assertThrows,
  assertTrue,
  assertUndefined,
} from './AuthoringAssertions';
import { MockContext } from './MockContext';
import { MockRegistry, DuplicateEntryError } from './MockRegistry';
import type { TestReport } from './TestReport';

/** Create a module whose initialize/shutdown calls are counted. */
function createSpyModule(name: string): { module: AuthoringModule; initCount: () => number; shutdownCount: () => number } {
  let init = 0;
  let shutdown = 0;
  const module: AuthoringModule = {
    getName: () => name,
    getVersion: () => '1.0.0',
    initialize: () => {
      init += 1;
    },
    shutdown: () => {
      shutdown += 1;
    },
  };
  return { module, initCount: () => init, shutdownCount: () => shutdown };
}

/** Create a log sink that records every entry it receives. */
function createCaptureSink(): { entries: LogEntry[]; sink: LogSink } {
  const entries: LogEntry[] = [];
  const sink: LogSink = { write: (entry) => entries.push(entry) };
  return { entries, sink };
}

/** Build the self-test runner with every foundation validation registered. */
export function createSelfTestRunner(): AuthoringTestRunner {
  const runner = new AuthoringTestRunner({ title: 'Authoring Foundation Self-Test' });

  runner.add(
    defineTest({
      name: 'module initialization',
      description: 'Registering then initializing a module marks the system ready and calls initialize once.',
      expected: 'lifecycle is "ready" and the module was initialized exactly once',
      execute: async () => {
        const system = new AuthoringSystem({ engineVersion: '1.2.3' });
        const spy = createSpyModule('init-spy');
        system.registerModule(spy.module);
        await system.initialize();
        assertEqual(system.getLifecycle(), 'ready', 'system lifecycle');
        assertEqual(spy.initCount(), 1, 'initialize call count');
        await system.shutdown();
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'duplicate registration',
      description: 'Registering two modules with the same name is rejected.',
      expected: 'the second registration throws',
      execute: () => {
        const system = new AuthoringSystem();
        const a = createSpyModule('dup');
        const b = createSpyModule('dup');
        system.registerModule(a.module);
        const error = assertThrows(() => system.registerModule(b.module), 'duplicate registration');
        assertTrue(error.message.includes('dup'), 'error names the duplicate module');
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'module shutdown',
      description: 'Shutting down the system stops it and calls each module shutdown once.',
      expected: 'lifecycle is "stopped" and the module was shut down exactly once',
      execute: async () => {
        const system = new AuthoringSystem();
        const spy = createSpyModule('shutdown-spy');
        system.registerModule(spy.module);
        await system.initialize();
        await system.shutdown('self-test');
        assertEqual(system.getLifecycle(), 'stopped', 'system lifecycle');
        assertEqual(spy.shutdownCount(), 1, 'shutdown call count');
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'configuration loading',
      description: 'Config exposes defaults, honors overrides, and supports get/set/merge/snapshot.',
      expected: 'defaults match, overrides apply, and snapshot is immutable',
      execute: () => {
        assertEqual(DEFAULT_AUTHORING_CONFIG.debug, false, 'default debug');
        assertEqual(DEFAULT_AUTHORING_CONFIG.developmentMode, true, 'default developmentMode');
        const config = new AuthoringConfig({ debug: true, verboseLogging: true });
        assertTrue(config.get('debug'), 'override debug');
        assertTrue(config.get('verboseLogging'), 'override verboseLogging');
        assertFalse(config.get('previewMode'), 'untouched previewMode');
        config.set('previewMode', true);
        assertTrue(config.get('previewMode'), 'set previewMode');
        const snapshot = config.snapshot();
        config.merge({ experimentalFeatures: true });
        assertTrue(config.get('experimentalFeatures'), 'merged experimentalFeatures');
        assertFalse(snapshot.experimentalFeatures, 'snapshot isolated from later merge');
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'context mutation',
      description: 'MockContext simulates debug, theme, language, build mode, root, and module lookup.',
      expected: 'setters update getters and module lookups reflect added modules',
      execute: () => {
        const ctx = new MockContext({ debug: false, theme: 'alpha' });
        assertFalse(ctx.debug, 'initial debug');
        assertEqual(ctx.theme, 'alpha', 'initial theme');
        ctx.setDebug(true);
        ctx.setTheme('beta');
        ctx.setLanguage('fr');
        assertTrue(ctx.debug, 'mutated debug');
        assertEqual(ctx.theme, 'beta', 'mutated theme');
        assertEqual(ctx.language, 'fr', 'mutated language');
        assertNotEqual(ctx.projectRoot, '', 'project root is present');
        const spy = createSpyModule('ctx-module');
        ctx.addModule(spy.module);
        assertDefined(ctx.getModule('ctx-module'), 'module lookup');
        assertArrayLength(ctx.listModules(), 1, 'module list');
        ctx.removeModule('ctx-module');
        assertUndefined(ctx.getModule('ctx-module'), 'module removed');
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'logger output',
      description: 'Logger routes leveled, timestamped entries to sinks and gates debug on verbose.',
      expected: 'info/warn/error/success are captured; debug only when verbose',
      execute: () => {
        const { entries, sink } = createCaptureSink();
        const logger = new Logger({ scope: 'self-test', sinks: [sink] });
        logger.info('i');
        logger.warning('w');
        logger.error('e');
        logger.success('s');
        logger.debug('hidden');
        assertEqual(entries.length, 4, 'entries before verbose');
        logger.setVerbose(true);
        logger.debug('shown');
        assertEqual(entries.length, 5, 'entries after verbose');
        assertTrue(entries.every((entry) => entry.timestamp > 0), 'every entry timestamped');
        assertEqual(entries[0].level, 'info', 'first level');
        assertEqual(entries[4].level, 'debug', 'last level');
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'registry operations',
      description: 'FileRegistry and MockRegistry support register, lookup, duplicate, and removal.',
      expected: 'both registries track entries and MockRegistry rejects duplicates',
      execute: () => {
        const files = new FileRegistry();
        files.register({ path: 'src/a.ts', kind: 'source', tags: ['core'] });
        files.register({ path: 'src/b.png', kind: 'asset' });
        assertEqual(files.size(), 2, 'file registry size');
        assertDefined(files.getByPath('src/a.ts'), 'lookup by path');
        assertArrayLength(files.listByKind('asset'), 1, 'filter by kind');
        assertTrue(files.unregister('src/a.ts'), 'removal succeeds');
        assertFalse(files.has('src/a.ts'), 'removed entry gone');
        files.clear();
        assertEqual(files.size(), 0, 'cleared');

        const registry = new MockRegistry<number>();
        registry.register('one', 1);
        registry.register('two', 2);
        assertThrows(() => registry.register('one', 99), 'duplicate id rejected');
        const dup = assertThrows(() => registry.register('two', 2));
        assertTrue(dup instanceof DuplicateEntryError, 'throws DuplicateEntryError');
        registry.set('one', 10);
        assertEqual(registry.get('one'), 10, 'set replaces');
        assertEqual(registry.unregister('two'), true, 'unregister');
        assertEqual(registry.size(), 1, 'size after removal');
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'performance budget',
      description: 'Framework primitives construct and run well within the documented budget.',
      expected: 'a batch of mock/assert operations completes in a few milliseconds',
      execute: () => {
        const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const ctx = new MockContext();
        const registry = new MockRegistry<string>();
        for (let i = 0; i < 100; i += 1) {
          registry.register(`id-${i}`, `value-${i}`);
        }
        assertEqual(registry.size(), 100, 'bulk register');
        assertDefined(ctx.theme, 'context read');
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
        if (elapsed > 25) {
          throw new Error(`Performance budget exceeded: ${elapsed.toFixed(2)}ms`);
        }
      },
    }),
  );

  runner.add(
    defineTest({
      name: 'skipped example',
      description: 'Demonstrates the skipped path; disabled tests never execute.',
      enabled: false,
      execute: () => {
        throw new Error('This disabled test must never run.');
      },
    }),
  );

  return runner;
}

/**
 * Run the complete self-test suite and return the structured report.
 * The report can be inspected, serialized via `report.serialize()`, or printed
 * with `report.print()`.
 */
export async function runAuthoringSelfTest(): Promise<TestReport> {
  const runner = createSelfTestRunner();
  return runner.runAll();
}
