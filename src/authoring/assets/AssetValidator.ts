/**
 * Structural validation for asset definitions (the orchestrator).
 *
 * Each module owns its checks: AssetDefinition (metadata and envelope), AssetSchema
 * (properties and schema self-checks), AssetReference (reference shape, rules, and
 * targets), and AssetDependency (dependency targets and cycles). This file combines
 * them, adds cross-asset duplicate checks, and produces a sorted, deterministic report.
 *
 * It does NOT judge gameplay balance. A numeric value is only checked against
 * bounds that the schema declares.
 */
import {
  compareStrings,
  errorDraft,
  findDuplicates,
  isJsonObject,
  warningDraft,
  type AssetStatus,
  type IssueDraft,
  type ValidationIssue,
} from "./AssetTypes";
import { validateDefinitionShape, type AssetDefinition } from "./AssetDefinition";
import {
  checkReferenceRules,
  checkReferenceTarget,
  validateAssetReference,
  type AssetReference,
} from "./AssetReference";
import {
  buildDependencyGraph,
  checkDependencyTargets,
  detectDependencyCycles,
} from "./AssetDependency";
import { checkProperties, validateSchemaDefinition, type AssetSchema } from "./AssetSchema";

export interface AssetStatusEntry {
  assetId: string;
  status: AssetStatus;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  /** Effective status per asset id, sorted by id. */
  statuses: AssetStatusEntry[];
  errorCount: number;
  warningCount: number;
  valid: boolean;
}

interface ValidationContext {
  byId: Map<string, AssetDefinition>;
  schemas: Map<string, AssetSchema>;
}

function attach(assetId: string, drafts: IssueDraft[]): ValidationIssue[] {
  return drafts.map((draft) => ({ ...draft, assetId }));
}

function buildContext(definitions: AssetDefinition[], schemas: AssetSchema[]): ValidationContext {
  const byId = new Map<string, AssetDefinition>();
  for (const definition of definitions) {
    if (!byId.has(definition.metadata.id)) byId.set(definition.metadata.id, definition);
  }
  const schemaMap = new Map<string, AssetSchema>();
  for (const schema of schemas) {
    if (!schemaMap.has(schema.schemaId)) schemaMap.set(schema.schemaId, schema);
  }
  return { byId, schemas: schemaMap };
}

function referenceKey(ref: AssetReference): string {
  return `${ref.referenceType}:${ref.referenceId}`;
}

function validateAgainstSchema(definition: AssetDefinition, ctx: ValidationContext): IssueDraft[] {
  const schema = ctx.schemas.get(definition.schemaId);
  if (schema === undefined) {
    return [errorDraft("SCHEMA_NOT_FOUND", "schemaId", `Schema "${definition.schemaId}" is not registered.`)];
  }
  const issues: IssueDraft[] = [];
  if (!schema.appliesTo.includes(definition.metadata.category)) {
    issues.push(
      errorDraft(
        "SCHEMA_CATEGORY_MISMATCH",
        "metadata.category",
        `Category "${definition.metadata.category}" is not allowed by schema "${schema.schemaId}".`,
      ),
    );
  }
  if (isJsonObject(definition.properties)) {
    issues.push(...checkProperties(schema, definition.properties));
  }
  return issues;
}

function validateReferences(definition: AssetDefinition, ctx: ValidationContext): IssueDraft[] {
  const schema = ctx.schemas.get(definition.schemaId);
  const rules = schema?.referenceRules ?? null;
  const references = Array.isArray(definition.references) ? definition.references : [];
  const issues: IssueDraft[] = [];
  references.forEach((ref, i) => {
    const path = `references[${i}]`;
    const target = ctx.byId.get(ref.referenceId)?.metadata;
    const rule = rules?.find((r) => r.referenceType === ref.referenceType);
    issues.push(...validateAssetReference(ref, path), ...checkReferenceTarget(ref, path, target, rule));
  });
  for (const key of findDuplicates(references.map(referenceKey))) {
    issues.push(warningDraft("DUPLICATE_REFERENCE", "references", `Reference "${key}" is declared more than once.`));
  }
  if (rules !== null) issues.push(...checkReferenceRules(rules, references));
  return issues;
}

function validateDependencyTargets(definition: AssetDefinition, ctx: ValidationContext): IssueDraft[] {
  const deps = Array.isArray(definition.dependencies) ? definition.dependencies : [];
  return checkDependencyTargets(deps, (id) => ctx.byId.has(id));
}

function schemaIssues(schemas: AssetSchema[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const schema of schemas) {
    issues.push(...attach(`schema:${schema.schemaId}`, validateSchemaDefinition(schema)));
  }
  for (const id of findDuplicates(schemas.map((s) => s.schemaId))) {
    issues.push({ code: "SCHEMA_DUPLICATE_ID", severity: "ERROR", assetId: `schema:${id}`, path: "schemaId", message: `Schema id "${id}" appears more than once.` });
  }
  return issues;
}

function duplicateIdIssues(definitions: AssetDefinition[]): ValidationIssue[] {
  return findDuplicates(definitions.map((d) => d.metadata.id)).map((id) => ({
    code: "DUPLICATE_ASSET_ID",
    severity: "ERROR" as const,
    assetId: id,
    path: "metadata.id",
    message: `Asset id "${id}" appears more than once.`,
  }));
}

/** Reports every member of each cycle so each affected asset is marked invalid. */
function cycleIssues(definitions: AssetDefinition[]): ValidationIssue[] {
  const cycles = detectDependencyCycles(buildDependencyGraph(definitions));
  const issues: ValidationIssue[] = [];
  for (const cycle of cycles) {
    const message = `Dependency cycle detected: ${cycle.join(" -> ")}.`;
    for (const id of new Set(cycle)) {
      issues.push({ code: "DEPENDENCY_CYCLE", severity: "ERROR", assetId: id, path: "dependencies", message });
    }
  }
  return issues;
}

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort(
    (a, b) =>
      compareStrings(a.assetId, b.assetId) ||
      compareStrings(a.path, b.path) ||
      compareStrings(a.code, b.code) ||
      compareStrings(a.message, b.message),
  );
}

/**
 * Effective status: DEPRECATED is kept as declared. Otherwise VALID when there
 * are no errors, and INVALID when there are. DRAFT is never produced here,
 * because a definition is either structurally valid or not.
 */
function computeStatuses(definitions: AssetDefinition[], issues: ValidationIssue[]): AssetStatusEntry[] {
  const failing = new Set(issues.filter((i) => i.severity === "ERROR").map((i) => i.assetId));
  const seen = new Set<string>();
  const entries: AssetStatusEntry[] = [];
  for (const definition of definitions) {
    const id = definition.metadata.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const status: AssetStatus =
      definition.status === "DEPRECATED" ? "DEPRECATED" : failing.has(id) ? "INVALID" : "VALID";
    entries.push({ assetId: id, status });
  }
  return entries.sort((a, b) => compareStrings(a.assetId, b.assetId));
}

function assetIssues(definition: AssetDefinition, ctx: ValidationContext): IssueDraft[] {
  return [
    ...validateDefinitionShape(definition),
    ...validateAgainstSchema(definition, ctx),
    ...validateReferences(definition, ctx),
    ...validateDependencyTargets(definition, ctx),
  ];
}

/** Runs all structural checks over a set of definitions and schemas. Pure function. */
export function validateAssets(definitions: AssetDefinition[], schemas: AssetSchema[]): ValidationReport {
  const ctx = buildContext(definitions, schemas);
  const issues: ValidationIssue[] = [
    ...schemaIssues(schemas),
    ...duplicateIdIssues(definitions),
    ...cycleIssues(definitions),
  ];
  for (const definition of definitions) {
    issues.push(...attach(definition.metadata.id, assetIssues(definition, ctx)));
  }
  const sorted = sortIssues(issues);
  const errorCount = sorted.filter((i) => i.severity === "ERROR").length;
  return {
    issues: sorted,
    statuses: computeStatuses(definitions, sorted),
    errorCount,
    warningCount: sorted.length - errorCount,
    valid: errorCount === 0,
  };
}
