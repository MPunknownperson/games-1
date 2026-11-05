/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportValidator.ts performs structural validation of export manifests:
 * completeness, duplicate identifiers, missing metadata, invalid dependency
 * declarations, and unsupported formats.
 *
 * It validates *structure* only — never gameplay rules, balance, graphics, or
 * runtime behaviour.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ExportManifest } from './ExportManifest';
import { ExportCategory, ExportFormat, type ExportVersion } from './ExportTypes';

/** Severity of a single export validation finding. */
export type ExportIssueSeverity = 'error' | 'warning';

/** One structural finding produced during export validation. */
export interface ExportValidationIssue {
  /** Stable machine-readable code. */
  readonly code: string;
  /** How serious the finding is. */
  readonly severity: ExportIssueSeverity;
  /** Human-readable explanation. */
  readonly message: string;
  /** Dotted path into the manifest, when applicable. */
  readonly path?: string;
}

/** Aggregate outcome of an export validation pass. */
export interface ExportValidationResult {
  /** True when no `error`-severity findings were produced. */
  readonly valid: boolean;
  /** Every finding, in discovery order. */
  readonly issues: readonly ExportValidationIssue[];
  /** Count of `error`-severity findings. */
  readonly errorCount: number;
  /** Count of `warning`-severity findings. */
  readonly warningCount: number;
}

const VALID_FORMATS = new Set<string>(Object.values(ExportFormat));
const VALID_CATEGORIES = new Set<string>(Object.values(ExportCategory));

/** Whether a value is a structurally valid version. */
function isValidVersion(value: unknown): value is ExportVersion {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ExportVersion>;
  const ok = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  return ok(v.major) && ok(v.minor) && ok(v.patch);
}

/** Check the manifest's own identity and version fields. */
function checkIdentity(manifest: ExportManifest, issues: ExportValidationIssue[]): void {
  if (typeof manifest.packageId !== 'string' || manifest.packageId.trim().length === 0) {
    issues.push({ code: 'EXPORT_MISSING_PACKAGE_ID', severity: 'error', message: 'Manifest has no packageId.', path: 'packageId' });
  }
  if (typeof manifest.packageName !== 'string' || manifest.packageName.trim().length === 0) {
    issues.push({ code: 'EXPORT_MISSING_PACKAGE_NAME', severity: 'error', message: 'Manifest has no packageName.', path: 'packageName' });
  }
  if (!isValidVersion(manifest.version)) {
    issues.push({ code: 'EXPORT_INVALID_VERSION', severity: 'error', message: 'Manifest version must have non-negative integer major, minor, and patch.', path: 'version' });
  }
  if (!isValidVersion(manifest.manifestVersion)) {
    issues.push({ code: 'EXPORT_INVALID_MANIFEST_VERSION', severity: 'error', message: 'Manifest format version is malformed.', path: 'manifestVersion' });
  }
  if (typeof manifest.createdAt !== 'string' || manifest.createdAt.length === 0) {
    issues.push({ code: 'EXPORT_MISSING_TIMESTAMP', severity: 'error', message: 'Manifest has no createdAt timestamp.', path: 'createdAt' });
  }
  if (!manifest.author || typeof manifest.author.name !== 'string' || manifest.author.name.length === 0) {
    issues.push({ code: 'EXPORT_MISSING_AUTHOR', severity: 'warning', message: 'Manifest declares no author name.', path: 'author.name' });
  }
}

/** Check entries for duplicates, missing metadata, and unsupported formats. */
function checkEntries(manifest: ExportManifest, issues: ExportValidationIssue[]): void {
  if (!Array.isArray(manifest.entries)) {
    issues.push({ code: 'EXPORT_ENTRIES_NOT_ARRAY', severity: 'error', message: 'Manifest entries must be an array.', path: 'entries' });
    return;
  }
  const seen = new Set<string>();
  manifest.entries.forEach((entry, index) => {
    const path = `entries.${index}`;
    if (!entry || typeof entry !== 'object') {
      issues.push({ code: 'EXPORT_ENTRY_INVALID', severity: 'error', message: 'Entry is not an object.', path });
      return;
    }
    if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
      issues.push({ code: 'EXPORT_ENTRY_MISSING_ID', severity: 'error', message: 'Entry has no identifier.', path });
      return;
    }
    if (seen.has(entry.id)) {
      issues.push({ code: 'EXPORT_DUPLICATE_ENTRY_ID', severity: 'error', message: `Duplicate entry identifier "${entry.id}".`, path });
    }
    seen.add(entry.id);
    if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
      issues.push({ code: 'EXPORT_ENTRY_MISSING_NAME', severity: 'warning', message: `Entry "${entry.id}" has no name.`, path: `${path}.name` });
    }
    if (!VALID_FORMATS.has(entry.format as string)) {
      issues.push({ code: 'EXPORT_UNSUPPORTED_FORMAT', severity: 'error', message: `Entry "${entry.id}" declares unsupported format "${String(entry.format)}".`, path: `${path}.format` });
    }
    if (!VALID_CATEGORIES.has(entry.category as string)) {
      issues.push({ code: 'EXPORT_UNSUPPORTED_CATEGORY', severity: 'error', message: `Entry "${entry.id}" declares unsupported category "${String(entry.category)}".`, path: `${path}.category` });
    }
    if (!entry.source || typeof entry.source.sourceId !== 'string' || entry.source.sourceId.length === 0) {
      issues.push({ code: 'EXPORT_ENTRY_MISSING_SOURCE', severity: 'error', message: `Entry "${entry.id}" has no source reference.`, path: `${path}.source` });
    }
  });
}

/** Check declared dependencies for structural validity. */
function checkDependencies(manifest: ExportManifest, issues: ExportValidationIssue[]): void {
  if (!Array.isArray(manifest.dependencies)) {
    issues.push({ code: 'EXPORT_DEPENDENCIES_NOT_ARRAY', severity: 'error', message: 'Manifest dependencies must be an array.', path: 'dependencies' });
    return;
  }
  const seen = new Set<string>();
  manifest.dependencies.forEach((dep, index) => {
    const path = `dependencies.${index}`;
    if (!dep || typeof dep.id !== 'string' || dep.id.trim().length === 0) {
      issues.push({ code: 'EXPORT_DEPENDENCY_MISSING_ID', severity: 'error', message: 'Dependency has no identifier.', path });
      return;
    }
    if (seen.has(dep.id)) {
      issues.push({ code: 'EXPORT_DUPLICATE_DEPENDENCY', severity: 'warning', message: `Dependency "${dep.id}" is declared more than once.`, path });
    }
    seen.add(dep.id);
    if (dep.minimumVersion !== undefined && !isValidVersion(dep.minimumVersion)) {
      issues.push({ code: 'EXPORT_DEPENDENCY_INVALID_VERSION', severity: 'error', message: `Dependency "${dep.id}" declares a malformed minimum version.`, path: `${path}.minimumVersion` });
    }
    if (dep.id === manifest.packageId) {
      issues.push({ code: 'EXPORT_SELF_DEPENDENCY', severity: 'error', message: `Package "${manifest.packageId}" declares a dependency on itself.`, path });
    }
  });
}

/**
 * Validate an export manifest's structure.
 * Complexity is linear in entries plus dependencies.
 */
export function validateExportManifest(manifest: ExportManifest): ExportValidationResult {
  const issues: ExportValidationIssue[] = [];
  if (!manifest || typeof manifest !== 'object') {
    issues.push({ code: 'EXPORT_MANIFEST_MISSING', severity: 'error', message: 'No manifest supplied for validation.' });
    return buildResult(issues);
  }
  checkIdentity(manifest, issues);
  checkEntries(manifest, issues);
  checkDependencies(manifest, issues);
  if (Array.isArray(manifest.entries) && manifest.entries.length === 0) {
    issues.push({ code: 'EXPORT_PACKAGE_EMPTY', severity: 'warning', message: 'Package describes no entries.', path: 'entries' });
  }
  return buildResult(issues);
}

/** Render a validation result as readable lines. */
export function formatExportValidation(result: ExportValidationResult): string {
  if (result.issues.length === 0) return 'Export validation passed with no issues.';
  const lines = result.issues.map((issue) => {
    const where = issue.path ? ` [${issue.path}]` : '';
    return `  ${issue.severity.toUpperCase()} ${issue.code}${where}: ${issue.message}`;
  });
  return [`Export validation: ${result.errorCount} error(s), ${result.warningCount} warning(s)`, ...lines].join('\n');
}

/** Build an {@link ExportValidationResult} from a list of issues. */
function buildResult(issues: ExportValidationIssue[]): ExportValidationResult {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  return { valid: errorCount === 0, issues, errorCount, warningCount: issues.length - errorCount };
}
