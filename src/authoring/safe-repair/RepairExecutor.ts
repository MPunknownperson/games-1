/**
 * In-memory executor for policy-approved, trivial or small local repairs.
 *
 * This module NEVER reads or writes files. Callers supply immutable document
 * text and receive new document objects. Moderate, large, protected, or
 * approval-gated plans are rejected.
 */
import type { SafeRepairContext } from './SafeRepairContext';
import { evaluatePlanForExecution } from './SafeRepairPolicy';
import {
  RepairDecision,
  RepairOperation,
  RepairStatus,
  type RepairChange,
  type RepairDocument,
  type RepairExecutionOutput,
  type SafeRepairPlan,
} from './SafeRepairTypes';

/** Apply an approved safe plan to caller-supplied in-memory documents. */
export function executeSafeRepair(
  plan: SafeRepairPlan,
  documents: readonly RepairDocument[],
  context: SafeRepairContext,
): RepairExecutionOutput {
  const policy = evaluatePlanForExecution(plan, context);
  if (!policy.allowed || plan.decision !== RepairDecision.AUTO_FIX_ALLOWED || !plan.approved) {
    return failed(documents, policy.reasons.length > 0 ? policy.reasons : ['Plan is not approved for automatic repair.']);
  }

  const working = new Map(documents.map((document) => [document.path, document.content]));
  const changed = new Set<string>();
  let changedLines = 0;
  for (const change of plan.changes) {
    const result = applyChange(change, working.get(change.path));
    if (!result.success) return failed(documents, [result.error ?? 'Repair change failed.']);
    working.set(change.path, result.content as string);
    changed.add(change.path);
    changedLines += result.changedLines;
  }
  return {
    success: true,
    status: RepairStatus.SUCCESS,
    documents: documents.map((document) => ({
      path: document.path,
      content: working.get(document.path) ?? document.content,
    })),
    changedPaths: Array.from(changed).sort(),
    changedLines,
    errors: [],
  };
}

/** Apply one exact operation to a document string. */
function applyChange(
  change: RepairChange,
  current: string | undefined,
): { success: boolean; content?: string; changedLines: number; error?: string } {
  if (current === undefined) return { success: false, changedLines: 0, error: `Document not supplied: ${change.path}.` };
  if (change.operation === RepairOperation.INSERT_TEXT) {
    return insertText(change, current);
  }
  return replaceExact(change, current);
}

/** Insert exact text at an approved character offset. */
function insertText(
  change: RepairChange,
  current: string,
): { success: boolean; content?: string; changedLines: number; error?: string } {
  const offset = change.insertOffset;
  if (offset === undefined || offset < 0 || offset > current.length) {
    return { success: false, changedLines: 0, error: `Invalid insert offset for ${change.id}.` };
  }
  const text = change.replacementText ?? '';
  return {
    success: true,
    content: `${current.slice(0, offset)}${text}${current.slice(offset)}`,
    changedLines: countLines(text),
  };
}

/** Replace one uniquely occurring text fragment. */
function replaceExact(
  change: RepairChange,
  current: string,
): { success: boolean; content?: string; changedLines: number; error?: string } {
  const search = change.searchText;
  if (!search) return { success: false, changedLines: 0, error: `Change ${change.id} has no searchText.` };
  const first = current.indexOf(search);
  const last = current.lastIndexOf(search);
  if (first < 0) return { success: false, changedLines: 0, error: `Search text not found for ${change.id}.` };
  if (first !== last) return { success: false, changedLines: 0, error: `Search text is not unique for ${change.id}.` };
  const replacement = change.replacementText ?? '';
  return {
    success: true,
    content: `${current.slice(0, first)}${replacement}${current.slice(first + search.length)}`,
    changedLines: Math.max(countLines(search), countLines(replacement)),
  };
}

/** Build a failure output without changing caller documents. */
function failed(
  documents: readonly RepairDocument[],
  errors: readonly string[],
): RepairExecutionOutput {
  return {
    success: false,
    status: RepairStatus.FAILED,
    documents: documents.map((document) => ({ ...document })),
    changedPaths: [],
    changedLines: 0,
    errors: [...errors],
  };
}

/** Count lines touched by a text fragment. */
function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}