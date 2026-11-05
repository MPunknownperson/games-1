/**
 * PRESERVE Authoring System — Repair Planning Layer.
 *
 * RepairPlan.ts represents a structured collection of planned repair actions
 * designed to address upstream verification findings.
 *
 * It provides deterministic ordering, risk summary aggregation, and JSON
 * serialization. A plan is purely a description of intended work — it contains
 * no execution logic and never modifies files.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { compareActions, type RepairAction } from './RepairAction';
import {
  RepairRisk,
  maxRisk,
  type RepairIssueReference,
} from './RepairTypes';

/** Summary breakdown of risk across all actions in a plan. */
export interface RepairRiskSummary {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
  readonly highestRisk: RepairRisk;
}

/** Plain, JSON-serializable representation of a {@link RepairPlan}. */
export interface RepairPlanData {
  readonly planId: string;
  readonly createdAt: string;
  readonly verificationRequired: boolean;
  readonly riskSummary: RepairRiskSummary;
  readonly issueReferences: readonly RepairIssueReference[];
  readonly actions: readonly RepairAction[];
}

/** Options accepted when constructing a {@link RepairPlan}. */
export interface RepairPlanOptions {
  /** Explicit plan identifier. Defaults to auto-generated id. */
  readonly planId?: string;
  /** Fixed ISO-8601 timestamp for deterministic output. */
  readonly createdAt?: string;
  /** Initial issue references. */
  readonly issueReferences?: readonly RepairIssueReference[];
  /** Initial actions. */
  readonly actions?: readonly RepairAction[];
}

/**
 * Container holding a coordinated set of planned repair actions.
 * Composition-friendly: instantiate per repair session or planning pass.
 */
export class RepairPlan {
  readonly planId: string;
  readonly createdAt: string;

  private readonly issueRefsMap = new Map<string, RepairIssueReference>();
  private readonly actionsMap = new Map<string, RepairAction>();

  constructor(options: RepairPlanOptions = {}) {
    this.planId = options.planId ?? `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.createdAt = options.createdAt ?? new Date().toISOString();

    if (options.issueReferences) {
      for (const ref of options.issueReferences) {
        this.addIssueReference(ref);
      }
    }
    if (options.actions) {
      for (const action of options.actions) {
        this.addAction(action);
      }
    }
  }

  /** Add an upstream verification finding reference to this plan. */
  addIssueReference(ref: RepairIssueReference): void {
    const key = `${ref.source}:${ref.issueId}`;
    if (!this.issueRefsMap.has(key)) {
      this.issueRefsMap.set(key, { ...ref });
    }
  }

  /**
   * Add a planned repair action to the plan.
   * Overwrites any existing action with the exact same action id.
   */
  addAction(action: RepairAction): void {
    this.actionsMap.set(action.id, action);
    if (action.issueReference) {
      this.addIssueReference(action.issueReference);
    }
  }

  /** Remove an action by its identifier. Returns true if removed. */
  removeAction(actionId: string): boolean {
    return this.actionsMap.delete(actionId);
  }

  /** Retrieve an action by its identifier. O(1). */
  getAction(actionId: string): RepairAction | undefined {
    return this.actionsMap.get(actionId);
  }

  /** Whether an action with the given identifier exists in the plan. O(1). */
  hasAction(actionId: string): boolean {
    return this.actionsMap.has(actionId);
  }

  /**
   * List all planned actions, sorted deterministically by risk and target path.
   */
  listActions(): readonly RepairAction[] {
    return Array.from(this.actionsMap.values()).sort(compareActions);
  }

  /**
   * List all referenced verification issues, sorted deterministically by issueId.
   */
  listIssueReferences(): readonly RepairIssueReference[] {
    return Array.from(this.issueRefsMap.values()).sort((a, b) =>
      a.issueId.localeCompare(b.issueId),
    );
  }

  /** Total number of planned actions. */
  actionCount(): number {
    return this.actionsMap.size;
  }

  /** Whether any planned action requires a follow-up verification pass. */
  isVerificationRequired(): boolean {
    if (this.actionsMap.size === 0) return false;
    for (const action of this.actionsMap.values()) {
      if (action.requiresVerification) return true;
    }
    return false;
  }

  /** Compute an aggregate summary of risk across all planned actions. */
  getRiskSummary(): RepairRiskSummary {
    let low = 0;
    let medium = 0;
    let high = 0;
    let critical = 0;
    let highest: RepairRisk = RepairRisk.LOW;

    for (const action of this.actionsMap.values()) {
      highest = maxRisk(highest, action.risk);
      switch (action.risk) {
        case RepairRisk.LOW:
          low += 1;
          break;
        case RepairRisk.MEDIUM:
          medium += 1;
          break;
        case RepairRisk.HIGH:
          high += 1;
          break;
        case RepairRisk.CRITICAL:
          critical += 1;
          break;
      }
    }

    return { low, medium, high, critical, highestRisk: highest };
  }

  /** Clear all actions and issue references from the plan. */
  clear(): void {
    this.actionsMap.clear();
    this.issueRefsMap.clear();
  }

  /** Return a plain, JSON-serializable snapshot of the plan. */
  toJSON(): Readonly<RepairPlanData> {
    return {
      planId: this.planId,
      createdAt: this.createdAt,
      verificationRequired: this.isVerificationRequired(),
      riskSummary: this.getRiskSummary(),
      issueReferences: this.listIssueReferences(),
      actions: this.listActions(),
    };
  }

  /** Serialize the plan to a deterministic JSON string. */
  serialize(pretty = true): string {
    return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0);
  }

  /** Rebuild a {@link RepairPlan} from serialised data. */
  static fromData(data: RepairPlanData): RepairPlan {
    return new RepairPlan({
      planId: data.planId,
      createdAt: data.createdAt,
      issueReferences: data.issueReferences,
      actions: data.actions,
    });
  }
}
