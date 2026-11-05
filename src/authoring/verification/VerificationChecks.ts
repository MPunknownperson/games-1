/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationChecks.ts implements the built-in structural checks: file size,
 * function size, dependency direction, runtime isolation, serialization
 * safety, determinism, and a build-outcome adapter.
 *
 * Every check is an independent rule operating on caller-supplied descriptors.
 * Nothing here reads the filesystem, opens a socket, or touches the runtime.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { defineRule, type VerificationRule } from './VerificationRule';
import {
  VerificationCategory,
  VerificationSeverity,
  VerificationTargetKind,
  createIssue,
  type BuildOutcomeDescriptor,
  type SourceFileDescriptor,
  type VerificationIssue,
} from './VerificationTypes';

/** Matches the module specifier of an import or re-export on a single line. */
const SPECIFIER_PATTERN = /from\s+['"]([^'"]+)['"]/;

/** Matches a line that plausibly opens a function or method body. */
const FUNCTION_PATTERN =
  /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:private|public|protected)?\s*(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{|const\s+(\w+)\s*=\s*(?:async\s*)?\()/;

/** Collect every module specifier imported by a file, with its line number. */
function collectImports(contents: string): { path: string; line: number }[] {
  const found: { path: string; line: number }[] = [];
  contents.split('\n').forEach((line, index) => {
    const match = SPECIFIER_PATTERN.exec(line);
    if (match) found.push({ path: match[1], line: index + 1 });
  });
  return found;
}

/** Estimate function body lengths by tracking brace depth. */
function measureFunctions(contents: string): { name: string; line: number; length: number }[] {
  const lines = contents.split('\n');
  const results: { name: string; line: number; length: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = FUNCTION_PATTERN.exec(lines[i]);
    if (!match || !lines[i].includes('{')) continue;
    const name = match[1] ?? match[2] ?? match[3] ?? 'anonymous';
    let depth = 0;
    let end = i;
    for (let j = i; j < lines.length; j += 1) {
      for (const char of lines[j]) {
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
      }
      if (depth <= 0) { end = j; break; }
      end = j;
    }
    results.push({ name, line: i + 1, length: end - i + 1 });
    i = end;
  }
  return results;
}

/** 1. File size — enforce the maximum permitted lines per file. */
export const fileSizeCheck: VerificationRule<SourceFileDescriptor> = defineRule({
  id: 'structure.file-size',
  name: 'File size limit',
  description: 'Each source file must stay within the configured line limit.',
  category: VerificationCategory.STRUCTURE,
  targetKind: VerificationTargetKind.SOURCE_FILE,
  verify: (file, context) => {
    const limit = context.configuration.maxFileLines;
    const lineCount = file.contents.split('\n').length;
    if (lineCount <= limit) return [];
    return [
      createIssue('FILE_TOO_LONG', VerificationCategory.STRUCTURE,
        `File has ${lineCount} lines, exceeding the limit of ${limit}.`,
        { location: { file: file.path }, actual: lineCount, limit }),
    ];
  },
});

/** 2. Function size — enforce the maximum permitted lines per function. */
export const functionSizeCheck: VerificationRule<SourceFileDescriptor> = defineRule({
  id: 'structure.function-size',
  name: 'Function size limit',
  description: 'Each function body must stay within the configured line limit.',
  category: VerificationCategory.STRUCTURE,
  targetKind: VerificationTargetKind.SOURCE_FILE,
  verify: (file, context) => {
    const limit = context.configuration.maxFunctionLines;
    return measureFunctions(file.contents)
      .filter((fn) => fn.length > limit)
      .map((fn) =>
        createIssue('FUNCTION_TOO_LONG', VerificationCategory.STRUCTURE,
          `Function "${fn.name}" spans ${fn.length} lines, exceeding the limit of ${limit}.`,
          { location: { file: file.path, symbol: fn.name, line: fn.line }, actual: fn.length, limit }),
      );
  },
});

/** 3. Dependency direction — reject forbidden external imports. */
export const dependencyDirectionCheck: VerificationRule<SourceFileDescriptor> = defineRule({
  id: 'dependency.forbidden-imports',
  name: 'Dependency direction',
  description: 'Authoring code must not import forbidden external modules.',
  category: VerificationCategory.DEPENDENCY,
  targetKind: VerificationTargetKind.SOURCE_FILE,
  verify: (file, context) => {
    const issues: VerificationIssue[] = [];
    for (const imported of collectImports(file.contents)) {
      const lowered = imported.path.toLowerCase();
      for (const pattern of context.configuration.forbiddenImportPatterns) {
        if (lowered === pattern || lowered.startsWith(`${pattern}/`)) {
          issues.push(createIssue('FORBIDDEN_IMPORT', VerificationCategory.DEPENDENCY,
            `Forbidden import "${imported.path}" is not permitted in authoring code.`,
            { location: { file: file.path, line: imported.line } }));
        }
      }
    }
    return issues;
  },
});

/** 4. Runtime isolation — reject imports that couple authoring to the runtime. */
export const runtimeIsolationCheck: VerificationRule<SourceFileDescriptor> = defineRule({
  id: 'isolation.runtime-coupling',
  name: 'Runtime isolation',
  description: 'Authoring code must not import engine, gameplay, or UI modules.',
  category: VerificationCategory.ISOLATION,
  targetKind: VerificationTargetKind.SOURCE_FILE,
  verify: (file, context) => {
    const issues: VerificationIssue[] = [];
    for (const imported of collectImports(file.contents)) {
      for (const pattern of context.configuration.runtimeImportPatterns) {
        if (imported.path.includes(pattern)) {
          issues.push(createIssue('RUNTIME_COUPLING', VerificationCategory.ISOLATION,
            `Import "${imported.path}" couples authoring code to the runtime.`,
            { location: { file: file.path, line: imported.line } }));
        }
      }
    }
    return issues;
  },
});

/** 5. Serialization — verify a structure survives a JSON round trip. */
export const serializationCheck: VerificationRule<unknown> = defineRule({
  id: 'serialization.json-safe',
  name: 'JSON serializable',
  description: 'Structures must round-trip through JSON without loss.',
  category: VerificationCategory.SERIALIZATION,
  targetKind: VerificationTargetKind.STRUCTURE,
  verify: (target) => {
    const issues: VerificationIssue[] = [];
    const seen = new WeakSet<object>();
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'function') {
        issues.push(createIssue('NON_SERIALIZABLE_VALUE', VerificationCategory.SERIALIZATION,
          `Function value at "${path}" cannot be serialized.`, { location: { symbol: path } }));
        return;
      }
      if (typeof value === 'undefined' || value === null || typeof value !== 'object') return;
      if (seen.has(value as object)) {
        issues.push(createIssue('CIRCULAR_STRUCTURE', VerificationCategory.SERIALIZATION,
          `Circular reference detected at "${path}".`, { location: { symbol: path } }));
        return;
      }
      seen.add(value as object);
      if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`));
      else for (const [k, v] of Object.entries(value as object)) walk(v, `${path}.${k}`);
    };
    walk(target, 'root');
    return issues;
  },
});

/** 6. Determinism — detect source patterns that make output unstable. */
export const determinismCheck: VerificationRule<SourceFileDescriptor> = defineRule({
  id: 'determinism.unstable-patterns',
  name: 'Deterministic output',
  description: 'Detects clock and randomness usage that destabilises output.',
  category: VerificationCategory.DETERMINISM,
  targetKind: VerificationTargetKind.SOURCE_FILE,
  verify: (file, context) => {
    const issues: VerificationIssue[] = [];
    file.contents.split('\n').forEach((line, index) => {
      if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
      for (const pattern of context.configuration.nonDeterministicPatterns) {
        if (line.includes(pattern)) {
          issues.push(createIssue('NON_DETERMINISTIC_SOURCE', VerificationCategory.DETERMINISM,
            `Use of "${pattern}" makes output non-deterministic; inject the value instead.`,
            { severity: VerificationSeverity.WARNING, location: { file: file.path, line: index + 1 } }));
        }
      }
    });
    return issues;
  },
});

/** 7. Build adapter — translate build outcome information into findings. */
export const buildVerificationCheck: VerificationRule<BuildOutcomeDescriptor> = defineRule({
  id: 'build.outcome',
  name: 'Build verification',
  description: 'Reports compilation failures and warnings from a build outcome.',
  category: VerificationCategory.BUILD,
  targetKind: VerificationTargetKind.BUILD,
  verify: (outcome) => {
    const issues: VerificationIssue[] = [];
    if (!outcome.success) {
      issues.push(createIssue('BUILD_FAILED', VerificationCategory.BUILD,
        'Build did not complete successfully.', { location: { file: 'build' } }));
    }
    for (const error of outcome.errors ?? []) {
      issues.push(createIssue('BUILD_COMPILATION_ERROR', VerificationCategory.BUILD,
        error, { location: { file: 'build' } }));
    }
    for (const warning of outcome.warnings ?? []) {
      issues.push(createIssue('BUILD_COMPILATION_WARNING', VerificationCategory.BUILD,
        warning, { severity: VerificationSeverity.WARNING, location: { file: 'build' } }));
    }
    return issues;
  },
});

/** Every built-in rule, in a stable order. */
export const BUILT_IN_CHECKS: readonly VerificationRule<never>[] = [
  fileSizeCheck, functionSizeCheck, dependencyDirectionCheck, runtimeIsolationCheck,
  serializationCheck, determinismCheck, buildVerificationCheck,
] as readonly VerificationRule<never>[];
