/**
 * PRESERVE Authoring System — TypeScript Backend.
 *
 * TypeScriptFormatter.ts applies indentation, line breaks, spacing, and
 * formatting consistency to generated code according to configuration
 * preferences. It never modifies semantic meaning or language tokens.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { TypeScriptBackendConfig } from './TypeScriptBackendConfig';

/**
 * Formats TypeScript source text according to backend configuration.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class TypeScriptFormatter {
  /**
   * Format a complete document from import statements and body lines.
   * Ensures consistent line separation, indentation, and line endings.
   */
  formatDocument(
    imports: readonly string[],
    bodyLines: readonly string[],
    config: TypeScriptBackendConfig,
  ): string {
    const eol = config.get('newlineStyle') === 'crlf' ? '\r\n' : '\n';
    const sections: string[] = [];

    if (imports.length > 0) {
      sections.push(imports.join(eol));
    }
    if (bodyLines.length > 0) {
      sections.push(this.cleanConsecutiveBlankLines(bodyLines).join(eol));
    }

    const raw = sections.join(eol + eol);
    return this.ensureTrailingNewline(raw, eol);
  }

  /**
   * Produce an indentation whitespace prefix for a given nesting level.
   */
  getIndentString(level: number, config: TypeScriptBackendConfig): string {
    if (level <= 0) return '';
    const size = config.get('indentSize');
    const char = config.get('useSpaces') ? ' ' : '\t';
    return char.repeat(level * (config.get('useSpaces') ? size : 1));
  }

  /** Indent a single line of text at the specified level. */
  formatLine(line: string, level: number, config: TypeScriptBackendConfig): string {
    if (!line || line.trim().length === 0) return '';
    return `${this.getIndentString(level, config)}${line.trimRight()}`;
  }

  /** Indent an array of lines at the specified level. */
  formatLines(lines: readonly string[], level: number, config: TypeScriptBackendConfig): readonly string[] {
    return lines.map((line) => this.formatLine(line, level, config));
  }

  /** Prevent more than one consecutive blank line in the output. */
  private cleanConsecutiveBlankLines(lines: readonly string[]): readonly string[] {
    const cleaned: string[] = [];
    let previousBlank = false;
    for (const line of lines) {
      const isBlank = line.trim().length === 0;
      if (isBlank && previousBlank) continue;
      cleaned.push(isBlank ? '' : line.trimRight());
      previousBlank = isBlank;
    }
    return cleaned;
  }

  /** Ensure the output terminates with exactly one line ending sequence. */
  private ensureTrailingNewline(text: string, eol: string): string {
    const trimmed = text.trimRight();
    return trimmed.length > 0 ? `${trimmed}${eol}` : '';
  }
}
