# PRESERVE Authoring — AI Self-Review Layer

A controlled AI self-review workflow for the PRESERVE authoring architecture. It
lets AI-assisted workflows review proposed changes **before** execution, detect
excessive scope, evaluate whether a repair attempt should continue / retry /
escalate / stop, enforce strict limits, verify results, and produce
deterministic reports.

**This is NOT an autonomous AI programmer.** It is a controlled decision and
review framework that analyzes, decides, tracks, verifies, and reports. It never
executes repairs, edits files, runs commands, calls APIs, or touches the
filesystem.

---

## Architecture

```
AI Proposal
    │
    ▼
Self Review Analyzer
    │
    ▼
Scope & Risk Evaluation
    │
    ▼
Decision Gate
    │
    ├──────────────────┐
    ▼                  ▼
 Approved          Escalated
    │                  │
    ▼                  ▼
Controlled Repair   Human Review
    │
    ▼
Verification
    │
    ▼
  Success?
    │
    ├──────────────────┐
    ▼                  ▼
 Complete       Retry / Stop
```

---

## Workflow

1. **Proposal** — A change footprint (`ChangeSummary`) and prior attempt history
   enter the analyzer.
2. **Self Review Analyzer** — Detects excessive scope, repeated failures,
   missing evidence, architecture impact, dependency changes, and protected
   path touches.
3. **Scope Evaluator** — Classifies the change as `SAFE`, `ACCEPTABLE`,
   `RISKY`, or `BLOCKED`.
4. **Decision Gate** — Produces `APPROVE_REPAIR`, `ALLOW_RETRY`,
   `REQUEST_REVIEW`, or `STOP_WORKFLOW`.
5. **Repair Attempt Tracker** — Records each attempt immutably.
6. **Retry Controller** — Decides whether a failed attempt may retry.
7. **Verifier** — Evaluates externally supplied build/type/test/import evidence.
8. **Report** — Aggregates status, attempts, findings, decisions, and
   verification summary into a deterministic, JSON-serializable report.

---

## Safety Model

Default safety limits:

| Limit | Default |
| :--- | :--- |
| `maximumRetryCount` | 3 |
| `maximumChangedFiles` | 3 |
| `maximumChangedLines` | 50 |
| `confidenceThreshold` | 0.85 |

Protected paths (never modified):

```
src/engine/   src/runtime/   src/game/   src/ui/
package.json  package-lock.json  vite.config.ts  tsconfig.json
```

Retry is **rejected** when the same failure repeats, the scope expands,
architecture impact appears, the retry limit is reached, or confidence drops
below the threshold. There are no infinite loops.

---

## Scope Classification Rules

| Classification | Conditions |
| :--- | :--- |
| **SAFE** | 1 file, <20 lines, no API/dependency change, confidence ≥ 0.9 |
| **ACCEPTABLE** | ≤3 files, ≤50 lines, confidence ≥ 0.85, no architecture/API change |
| **RISKY** | architecture changes, public API changes, or unclear cause |
| **BLOCKED** | runtime/engine/UI modification, dependency change, or excessive scope |

---

## Relationship with Other Layers

| Layer | Relationship |
| :--- | :--- |
| **Verification Layer** | Produces structural findings that feed the self-review analyzer as `SelfReviewFinding` records. Verification reports supply the evidence the verifier consumes. |
| **QA Evidence Layer** | Supplies build/type/test evidence that the self-review verifier evaluates against the proposed change footprint and context limits. |
| **Decision Layer** | Produces risk, impact, and confidence evaluations that the self-review scope evaluator and decision gate consume to classify and gate changes. |
| **Safe Repair Layer** | Receives only changes the self-review decision gate has `APPROVE_REPAIR`d. The repair attempt tracker records each controlled attempt, and the verifier gates whether the result is acceptable. |

The Self-Review Layer sits **between** the Decision Layer and the Safe Repair
Layer, acting as a final controlled gate that tracks attempts, prevents runaway
retries, and enforces scope escalation before any local repair is permitted.

---

## Why This is Not an Autonomous AI Programmer

An autonomous AI programmer loops indefinitely, edits files without approval,
commits changes, and deploys. This layer:

- **Never modifies files** — it only analyzes, decides, tracks, verifies, and
  reports.
- **Stops on excessive scope or repeated failure** — there are hard limits on
  retries (default 3), files (default 3), and lines (default 50).
- **Escalates to humans** when changes are risky or verification fails
  repeatedly.
- **Is fully tree-shakeable** — nothing in the runtime game imports it, so it is
  excluded from production bundles.

---

## File Responsibilities

| File | Responsibility |
| :--- | :--- |
| `SelfReviewTypes.ts` | Shared JSON-serializable contracts: `ReviewStatus`, `RepairAttemptStatus`, `EscalationReason`, `ScopeClassification`, `ReviewDecision`, findings, change summaries, attempts, retry decisions, decisions, verification evidence/results. |
| `SelfReviewContext.ts` | Immutable context with project version, workflow id, safety limits, protected areas, and timestamp. |
| `SelfReviewAnalyzer.ts` | Analyzes proposed repairs and produces findings (excessive scope, repeated failures, missing evidence, architecture/dependency/protected-path impact). |
| `ScopeEvaluator.ts` | Classifies change footprint into `SAFE`/`ACCEPTABLE`/`RISKY`/`BLOCKED`. |
| `SelfReviewDecision.ts` | Produces the final decision (`APPROVE_REPAIR`/`ALLOW_RETRY`/`REQUEST_REVIEW`/`STOP_WORKFLOW`). |
| `RepairAttemptTracker.ts` | Immutable, append-only attempt history with deterministic ordering. |
| `RetryController.ts` | Decides whether a failed attempt may retry (no infinite loops). |
| `SelfReviewVerifier.ts` | Evaluates externally supplied build/type/test/import evidence and scope compliance. |
| `SelfReviewReport.ts` | Aggregates workflow outcome into a deterministic, JSON-serializable report. |
| `README.md` | Architecture, workflow, safety model, and layer relationships. |

---

## Quick Start

```ts
import { createSelfReviewContext } from './SelfReviewContext';
import { analyzeSelfReview } from './SelfReviewAnalyzer';
import { decideSelfReview } from './SelfReviewDecision';
import { RepairAttemptTracker } from './RepairAttemptTracker';
import { verifySelfReview } from './SelfReviewVerifier';
import { SelfReviewReport } from './SelfReviewReport';

const context = createSelfReviewContext({ workflowId: 'wf_001', timestamp: '2026-01-01T00:00:00.000Z' });

const change = {
  changedFiles: 1,
  changedLines: 5,
  paths: ['src/authoring/schema/SchemaValidator.ts'],
  apiChanged: false,
  dependencyChanged: false,
  architectureChanged: false,
  confidence: 0.95,
};

const tracker = new RepairAttemptTracker();
const analysis = analyzeSelfReview({ changeSummary: change, attemptHistory: tracker.list(), hasVerificationEvidence: true }, context);
const decision = decideSelfReview({ changeSummary: change, scopeEvaluation: analysis.scopeEvaluation, findings: analysis.findings, tracker }, context);

const evidence = { buildPassed: true, typeCheckPassed: true, testsPassed: true, importIsolationPassed: true, errorsAfter: 0, actualChangedFiles: 1, actualChangedLines: 5 };
const verification = verifySelfReview(evidence, change, context);

const report = new SelfReviewReport(context);
report.setDecision(decision);
report.setFindings(analysis.findings);
report.setVerification(verification);

console.log(report.format(tracker));
console.log(report.serialize(tracker));
```
