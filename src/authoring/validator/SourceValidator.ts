/**
 * PRESERVE Authoring System — Validation System.
 *
 * SourceValidator.ts performs lightweight sanity checks on generated source
 * text: empty output, unbalanced brackets, malformed import lines, missing
 * exports, and a few obvious syntax problems.
 *
 * It is intentionally NOT a compiler, parser, or language service. Checks are
 * line-oriented and heuristic; anything requiring real parsing is out of scope.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { defineRule, defineValidator, type ValidationRule, type Validator } from './ValidationRule';
import {
  ValidationSeverity,
  ValidationTargetKind,
  createIssue,
  type ValidationIssue,
} from './ValidatorTypes';

/** Accepted shapes for a source validation target. */
export type SourceInput = string | { readonly path?: string; readonly contents?: string };

/** Normalize a source target into a path and contents pair. */
function readSource(target: SourceInput): { path?: string; contents: string } {
  if (typeof target === 'string') return { contents: target };
  if (target && typeof target === 'object') {
    return { path: target.path, contents: typeof target.contents === 'string' ? target.contents : '' };
  }
  return { contents: '' };
}

/** Strip line comments and string literals so scanning ignores their content. */
function stripNoise(line: string): string {
  let output = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const previous = i > 0 ? line[i - 1] : '';
    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '/' && line[i + 1] === '/') break;
    output += char;
  }
  return output;
}

/** Rule: generated output must not be empty. */
const emptyOutputRule: ValidationRule<SourceInput> = defineRule({
  id: 'source.output.empty',
  name: 'Output not empty',
  description: 'Generated source must contain at least some non-whitespace content.',
  validate: (target) => {
    const { path, contents } = readSource(target);
    if (contents.trim().length === 0) {
      return [
        createIssue('SOURCE_EMPTY', 'Generated source output is empty.', {
          location: { file: path },
          suggestion: 'Confirm the backend received IR input and produced declarations.',
        }),
      ];
    }
    return [];
  },
});

/** Rule: brackets, braces, and parentheses must balance. */
const bracketBalanceRule: ValidationRule<SourceInput> = defineRule({
  id: 'source.brackets.unmatched',
  name: 'Brackets balanced',
  description: 'Braces, parentheses, and square brackets must open and close in matching pairs.',
  validate: (target) => {
    const { path, contents } = readSource(target);
    if (contents.trim().length === 0) return [];
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const openers = new Set(['(', '[', '{']);
    const stack: { char: string; line: number; column: number }[] = [];
    const issues: ValidationIssue[] = [];
    const lines = contents.split('\n');

    lines.forEach((rawLine, lineIndex) => {
      const line = stripNoise(rawLine);
      for (let column = 0; column < line.length; column += 1) {
        const char = line[column];
        if (openers.has(char)) {
          stack.push({ char, line: lineIndex + 1, column: column + 1 });
          continue;
        }
        const expected = pairs[char];
        if (!expected) continue;
        const top = stack.pop();
        if (!top || top.char !== expected) {
          issues.push(
            createIssue('SOURCE_UNMATCHED_CLOSING', `Unmatched closing "${char}".`, {
              location: { file: path, line: lineIndex + 1, column: column + 1 },
              suggestion: `Add the matching "${expected}" or remove the stray "${char}".`,
            }),
          );
        }
      }
    });

    for (const unclosed of stack) {
      issues.push(
        createIssue('SOURCE_UNCLOSED_BRACKET', `Unclosed "${unclosed.char}".`, {
          location: { file: path, line: unclosed.line, column: unclosed.column },
          suggestion: 'Close the bracket before the end of the file.',
        }),
      );
    }
    return issues;
  },
});

/** Rule: import lines must be well-formed. */
const importShapeRule: ValidationRule<SourceInput> = defineRule({
  id: 'source.imports.malformed',
  name: 'Imports well-formed',
  description: 'Import statements must specify a quoted module source.',
  validate: (target) => {
    const { path, contents } = readSource(target);
    if (contents.trim().length === 0) return [];
    const issues: ValidationIssue[] = [];
    contents.split('\n').forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line.startsWith('import ')) return;
      const hasQuotedSource = /['"][^'"]+['"]/.test(line);
      if (!hasQuotedSource) {
        issues.push(
          createIssue('SOURCE_IMPORT_MALFORMED', 'Import statement has no quoted module source.', {
            location: { file: path, line: index + 1 },
            suggestion: 'Ensure the import ends with a quoted module specifier.',
          }),
        );
        return;
      }
      if (line.includes('{') && !line.includes('}')) {
        issues.push(
          createIssue('SOURCE_IMPORT_UNCLOSED_BINDINGS', 'Import binding list is not closed.', {
            location: { file: path, line: index + 1 },
            suggestion: 'Close the binding list with "}" on the same line.',
          }),
        );
      }
    });
    return issues;
  },
});

/** Rule: modules that declare content should export something. */
const exportPresenceRule: ValidationRule<SourceInput> = defineRule({
  id: 'source.exports.missing',
  name: 'Exports present',
  description: 'Advises when generated source declares content but exports nothing.',
  validate: (target) => {
    const { path, contents } = readSource(target);
    if (contents.trim().length === 0) return [];
    if (contents.includes('export ')) return [];
    const declares = /\b(class|interface|enum|function|const|let)\b/.test(contents);
    if (!declares) return [];
    return [
      createIssue('SOURCE_NO_EXPORTS', 'Generated source declares content but exports nothing.', {
        severity: ValidationSeverity.WARNING,
        location: { file: path },
        suggestion: 'Mark the intended declarations with `export`, or confirm this is internal.',
      }),
    ];
  },
});

/** Rule: catch a few obvious textual defects. */
const obviousSyntaxRule: ValidationRule<SourceInput> = defineRule({
  id: 'source.syntax.obvious-problems',
  name: 'Obvious syntax problems',
  description: 'Detects placeholder markers and doubled statement terminators.',
  validate: (target) => {
    const { path, contents } = readSource(target);
    if (contents.trim().length === 0) return [];
    const issues: ValidationIssue[] = [];
    contents.split('\n').forEach((rawLine, index) => {
      const line = stripNoise(rawLine);
      if (line.includes(';;')) {
        issues.push(
          createIssue('SOURCE_DOUBLE_SEMICOLON', 'Doubled statement terminator detected.', {
            severity: ValidationSeverity.WARNING,
            location: { file: path, line: index + 1 },
            suggestion: 'Remove the duplicate semicolon.',
          }),
        );
      }
      if (/\bundefined\s+undefined\b/.test(line)) {
        issues.push(
          createIssue('SOURCE_PLACEHOLDER_LEAK', 'Unresolved placeholder text detected.', {
            location: { file: path, line: index + 1 },
            suggestion: 'Check that the emitter received complete descriptor data.',
          }),
        );
      }
    });
    return issues;
  },
});

/** Every rule the source validator executes, in a stable order. */
export const SOURCE_VALIDATION_RULES: readonly ValidationRule<SourceInput>[] = [
  emptyOutputRule,
  bracketBalanceRule,
  importShapeRule,
  exportPresenceRule,
  obviousSyntaxRule,
];

/** Validator inspecting generated source text. */
export const sourceValidator: Validator<SourceInput> = defineValidator({
  id: 'source-validator',
  name: 'Generated Source Validator',
  targetKind: ValidationTargetKind.SOURCE,
  rules: SOURCE_VALIDATION_RULES,
});

/** Create a fresh source validator, optionally with a custom identifier. */
export function createSourceValidator(id = 'source-validator'): Validator<SourceInput> {
  return defineValidator({
    id,
    name: 'Generated Source Validator',
    targetKind: ValidationTargetKind.SOURCE,
    rules: SOURCE_VALIDATION_RULES,
  });
}
