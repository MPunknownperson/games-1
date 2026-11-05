/**
 * PRESERVE Authoring System — Validation System.
 *
 * IRValidator.ts checks Intermediate Representation structures for structural
 * defects: missing names and identifiers, malformed containers, invalid
 * parameter declarations, and unresolvable type references. It inspects shape
 * only — never gameplay meaning, balance, or performance.
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

/** Loose structural view of an IR node used during traversal. */
type IRLike = Record<string, unknown> & { kind?: unknown };

/** Declaration kinds that must carry a non-empty `name`. */
const NAMED_KINDS = new Set(['Module', 'Namespace', 'Class', 'Interface', 'Enum',
  'Function', 'Method', 'Property', 'Variable', 'Constant', 'Annotation']);

/** Fields that hold child nodes. */
const CONTAINER_KEYS = ['members', 'declarations', 'modules', 'statements'] as const;

/** Fields that hold a type descriptor. */
const TYPE_KEYS = ['type', 'returnType', 'propertyType'] as const;

/** Walk an IR tree, visiting every object node. Return false to stop descent. */
function walk(
  node: unknown,
  path: string,
  visit: (node: IRLike, path: string) => boolean | void,
): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}.${i}`, visit));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const candidate = node as IRLike;
  if (visit(candidate, path) === false) return;
  for (const key of CONTAINER_KEYS) {
    if (candidate[key] !== undefined) walk(candidate[key], `${path}.${key}`, visit);
  }
}

/** Rule: every node must declare a recognizable `kind` discriminator. */
const kindPresenceRule: ValidationRule<unknown> = defineRule({
  id: 'ir.node.missing-kind',
  name: 'Node kind present',
  description: 'Every IR node must declare a string `kind` discriminator.',
  validate: (target) => {
    const issues: ValidationIssue[] = [];
    walk(target, 'root', (node, path) => {
      if (typeof node.kind === 'string' && node.kind.length > 0) return;
      issues.push(createIssue('IR_NODE_MISSING_KIND', 'IR node does not declare a string `kind`.', {
        location: { path },
        suggestion: 'Add a `kind` discriminator such as "Class" or "Module".',
      }));
      return false;
    });
    return issues;
  },
});

/** Rule: named declarations (classes, modules, functions, ...) need a name. */
const namePresenceRule: ValidationRule<unknown> = defineRule({
  id: 'ir.declaration.missing-name',
  name: 'Declaration name present',
  description: 'Classes, modules, interfaces, and functions require a non-empty name.',
  validate: (target) => {
    const issues: ValidationIssue[] = [];
    walk(target, 'root', (node, path) => {
      const kind = node.kind as string;
      if (!NAMED_KINDS.has(kind)) return;
      const name = node.name;
      if (typeof name !== 'string' || name.trim().length === 0) {
        issues.push(createIssue('IR_DECLARATION_MISSING_NAME', `${kind} node has no name.`, {
          location: { path },
          suggestion: `Provide a non-empty \`name\` for the ${kind} node.`,
        }));
      }
    });
    return issues;
  },
});

/** Rule: file nodes must declare a `fileId`. */
const fileIdentityRule: ValidationRule<unknown> = defineRule({
  id: 'ir.file.missing-identifier',
  name: 'File identifier present',
  description: 'File nodes require a non-empty `fileId`.',
  validate: (target) => {
    const issues: ValidationIssue[] = [];
    walk(target, 'root', (node, path) => {
      if (node.kind !== 'File') return;
      const id = node.fileId;
      if (typeof id !== 'string' || id.trim().length === 0) {
        issues.push(createIssue('IR_FILE_MISSING_IDENTIFIER', 'File node has no `fileId`.', {
          location: { path },
          suggestion: 'Assign a stable logical `fileId` to the file node.',
        }));
      }
    });
    return issues;
  },
});

/** Rule: container fields must be arrays; blocks and types must be well-formed. */
const containerShapeRule: ValidationRule<unknown> = defineRule({
  id: 'ir.container.invalid-structure',
  name: 'Container structure valid',
  description: 'Container fields such as `members`, `declarations`, and `statements` must be arrays.',
  validate: (target) => {
    const issues: ValidationIssue[] = [];
    walk(target, 'root', (node, path) => {
      for (const key of CONTAINER_KEYS) {
        const container = node[key];
        if (container === undefined) continue;
        if (!Array.isArray(container)) {
          issues.push(createIssue('IR_CONTAINER_NOT_ARRAY', `Field \`${key}\` must be an array.`, {
            location: { path: `${path}.${key}` },
            suggestion: `Wrap the value of \`${key}\` in an array.`,
          }));
        }
      }
      const kind = node.kind;
      if ((kind === 'Class' || kind === 'Interface') && node.members === undefined) {
        issues.push(createIssue('IR_CONTAINER_MISSING_MEMBERS', `${String(kind)} node omits \`members\`.`, {
          severity: ValidationSeverity.WARNING,
          location: { path },
          suggestion: 'Provide an empty array when the declaration has no members.',
        }));
      }
    });
    return issues;
  },
});

/** Inspect a single parameter entry, appending any findings. */
function checkParameter(
  param: unknown,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!param || typeof param !== 'object') {
    issues.push(createIssue('IR_PARAMETER_INVALID', 'Parameter entry is not an object.', {
      location: { path },
    }));
    return;
  }
  const name = (param as { name?: unknown }).name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    issues.push(createIssue('IR_PARAMETER_MISSING_NAME', 'Parameter has no name.', {
      location: { path },
      suggestion: 'Give every parameter a non-empty `name`.',
    }));
    return;
  }
  if (seen.has(name)) {
    issues.push(createIssue('IR_PARAMETER_DUPLICATE_NAME', `Duplicate parameter name "${name}".`, {
      location: { path },
      suggestion: 'Rename the parameter so every name in the list is unique.',
    }));
  }
  seen.add(name);
}

/** Rule: parameter lists must be arrays of uniquely named entries. */
const parameterShapeRule: ValidationRule<unknown> = defineRule({
  id: 'ir.function.invalid-parameters',
  name: 'Parameters valid',
  description: 'Parameter lists must be arrays of uniquely named entries.',
  validate: (target) => {
    const issues: ValidationIssue[] = [];
    walk(target, 'root', (node, path) => {
      const params = node.parameters;
      if (params === undefined) return;
      if (!Array.isArray(params)) {
        issues.push(createIssue('IR_PARAMETERS_NOT_ARRAY', 'Field `parameters` must be an array.', {
          location: { path: `${path}.parameters` },
          suggestion: 'Provide parameters as an array of parameter descriptors.',
        }));
        return;
      }
      const seen = new Set<string>();
      params.forEach((param, i) => checkParameter(param, `${path}.parameters.${i}`, seen, issues));
    });
    return issues;
  },
});

/** Rule: type descriptors must name a type. */
const typeReferenceRule: ValidationRule<unknown> = defineRule({
  id: 'ir.type.invalid-reference',
  name: 'Type references valid',
  description: 'Type descriptors must declare a non-empty `typeName`.',
  validate: (target) => {
    const issues: ValidationIssue[] = [];
    walk(target, 'root', (node, path) => {
      for (const key of TYPE_KEYS) {
        const descriptor = node[key];
        if (descriptor === undefined) continue;
        if (!descriptor || typeof descriptor !== 'object') {
          issues.push(createIssue('IR_TYPE_INVALID', `Field \`${key}\` is not a type descriptor.`, {
            location: { path: `${path}.${key}` },
          }));
          continue;
        }
        const typeName = (descriptor as { typeName?: unknown }).typeName;
        if (typeof typeName !== 'string' || typeName.trim().length === 0) {
          issues.push(createIssue('IR_TYPE_MISSING_NAME', `Type descriptor at \`${key}\` has no \`typeName\`.`, {
            location: { path: `${path}.${key}` },
            suggestion: 'Set `typeName` to a primitive or a referenced type name.',
          }));
        }
      }
    });
    return issues;
  },
});

/** Every rule the IR validator executes, in a stable order. */
export const IR_VALIDATION_RULES: readonly ValidationRule<unknown>[] = [
  kindPresenceRule,
  namePresenceRule,
  fileIdentityRule,
  containerShapeRule,
  parameterShapeRule,
  typeReferenceRule,
];

/** Create an IR validator instance, optionally with a custom identifier. */
export function createIRValidator(id = 'ir-validator'): Validator<unknown> {
  return defineValidator({
    id,
    name: 'Intermediate Representation Validator',
    targetKind: ValidationTargetKind.IR,
    rules: IR_VALIDATION_RULES,
  });
}

/** Default validator inspecting Intermediate Representation structures. */
export const irValidator: Validator<unknown> = createIRValidator();
