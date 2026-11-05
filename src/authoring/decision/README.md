# PRESERVE Authoring — AI Decision & Confidence Layer

An isolated, structured decision-making infrastructure for AI-assisted development workflows. It evaluates detected issues and proposed repairs to answer critical safety and architectural questions before any repair is attempted:

- What is the problem?
- What is the estimated impact?
- How risky is the change?
- How confident is the AI assessment?
- Is automatic repair allowed?
- Does this require human approval?

This layer is **NOT** an external AI API integration (no OpenAI, Anthropic, Gemini, or third-party SDKs). It is **NOT** an autonomous coding agent. It does **NOT** execute repairs, edit files, run commands, call APIs, or touch the filesystem. It only analyzes and produces structured decisions.

---

## Architecture Position

```
Verification / QA Evidence
            │
            ▼
      Decision Layer
            │
            ├────────────────────────┐
            ▼                        ▼
     Safe Auto Repair        Human Review Required
            │                        │
            ▼                        ▼
     Safe Repair Layer      Developer Confirmation
```

The Decision Layer sits **after** Verification / QA Evidence and **before** Safe Repair execution. It acts as an evaluation gate that decides whether a proposed correction may proceed automatically or must halt for human review.

---

## Relationship with Verification & Safe Repair

| Layer | Primary Question | Responsibility |
| :--- | :--- | :--- |
| **Verification / QA Evidence** | *"What is broken or out of standard?"* | Detects structural defects, size violations, compilation failures, and layering breaches. Produces `VerificationReport` and advisory `RepairSuggestion` items. |
| **Decision Layer** | *"Is it safe and confident enough to fix automatically?"* | Evaluates risk, architectural impact, and AI confidence against strict policy thresholds. Produces `DecisionResult` (`APPROVED`, `REVIEW_REQUIRED`, or `REJECTED`). |
| **Safe Repair Layer** | *"How do we apply this exact local fix safely?"* | Classifies repair scope, plans local text operations (`RepairPlan`), and executes in-memory string modifications if policy allows. |

The Decision Layer prevents the Safe Repair Layer from receiving hazardous, high-impact, or low-confidence repair requests.

---

## Why This is Not an Autonomous AI Agent

An autonomous coding agent runs in an unsupervised loop, making code modifications, executing shell commands, and committing changes without human oversight.

The PRESERVE Decision Layer enforces strict boundaries against autonomy:
1. **Zero Execution**: This layer produces structured data (`DecisionResult`, `DecisionReport`). It never mutates files on disk, never runs compilers or tests, and never connects to git or network services.
2. **Mandatory Human-in-the-Loop**: Whenever a change exceeds single-file scope, touches public APIs or dependencies, or has lower confidence, the decision status transitions immediately to `REVIEW_REQUIRED`.
3. **Protected Runtime Isolation**: Nothing in the engine, gameplay, UI, rendering, or runtime imports this module, ensuring it is fully tree-shaken and excluded from shipping game builds.

---

## Why Confidence Checking Exists

Large Language Models and AI coding assistants can generate plausible-looking solutions even when the root cause of an issue is ambiguous or multiple competing architectural solutions exist.

The `ConfidenceEvaluator` systematically reduces confidence scores when:
- The root cause is unclear or ambiguous (`-0.25`).
- Multiple valid competing solutions exist without a canonical fix (`-0.20`).
- Architectural or cross-module boundaries are involved (`-0.30`).
- Verification evidence or test coverage is missing (`-0.20`).
- Protected runtime areas (`-0.35`) or public API breaking changes (`-0.25`) are involved.

By requiring a high confidence threshold (default: `>= 0.85`) for automatic approval, the system ensures that AI assistants only auto-apply repairs when the problem and solution are deterministic and unambiguous.

---

## Safety Boundaries & Policy Rules

The `DecisionPolicy` enforces conservative rules for automatic repair approval (`APPROVED`). Automatic repair is allowed **ONLY** when **ALL** of the following conditions hold:

1. **Risk Level**: `TRIVIAL` or `LOW`.
2. **Impact Level**: `SINGLE_FILE` (`local` scope).
3. **Line Count**: Less than 50 changed lines (`< maxAutoLinesChanged`).
4. **Dependencies**: No dependency modifications (`dependencyChanged === false`).
5. **Public APIs**: No exported interface or API modifications (`apiChanged === false`).
6. **Protected Areas**: Zero files touch protected runtime paths (`src/engine/*`, `src/runtime/*`, `src/game/*`, `src/ui/*`, `package.json`, `vite.config.ts`, `tsconfig.json`).
7. **AI Confidence**: Score is `>= 0.85` (`minAutoConfidence`).
8. **Approved Scope**: All target files reside within allowed authoring tooling paths (`src/authoring/*`).

If any condition fails, the decision is routed to `REVIEW_REQUIRED` (or `REJECTED` if it touches protected areas or carries `CRITICAL` risk).

---

## File Responsibilities

| File | Lines | Responsibility |
| :--- | :--- | :--- |
| **`DecisionTypes.ts`** | 100 | Shared JSON-serializable contracts: `DecisionStatus`, `RiskLevel`, `ImpactLevel`, `ConfidenceLevel`, `DecisionCategory`, risk weighting, and score mapping utilities. |
| **`DecisionContext.ts`** | 150 | Immutable context holding project version, workflow ID, issue source, safety boundary paths (`allowedAutoRepairScope`, `protectedAreas`), and `DecisionPolicyConfig`. |
| **`RiskAssessment.ts`** | 135 | Evaluates risk (`TRIVIAL` to `CRITICAL`) based on affected areas, breaking change possibilities, and estimated complexity (1–10). |
| **`ImpactAnalyzer.ts`** | 90 | Evaluates architectural and filesystem impact (`SINGLE_FILE`, `MULTIPLE_FILES`, `MODULE_LEVEL`, `SYSTEM_LEVEL`) from structured change metrics. |
| **`ConfidenceEvaluator.ts`** | 115 | Evaluates AI confidence scores (0.0–1.0) and levels (`VERY_LOW` to `VERY_HIGH`), applying systematic deductions for ambiguity and risk. |
| **`DecisionPolicy.ts`** | 135 | Central safety policy engine that combines risk, impact, confidence, and path boundaries into an `APPROVED`, `REVIEW_REQUIRED`, or `REJECTED` decision. |
| **`DecisionResult.ts`** | 145 | Immutable outcome container combining status, category, risk, impact, confidence, reasons, and required actions. |
| **`DecisionReport.ts`** | 140 | Aggregates multiple decisions into a combined, deterministic, JSON-serializable report with summary counts and status partitioning. |
| **`README.md`** | — | Architecture documentation, relationship with Verification/Safe Repair, autonomy boundaries, confidence rationale, and policy rules. |

---

## Quick Start Example

```ts
import {
  createDecisionContext,
  evaluateRisk,
  analyzeImpact,
  evaluateConfidence,
  evaluateDecisionPolicy,
  createDecisionResult,
  DecisionReport,
  DecisionCategory,
} from './src/authoring/decision';

// 1. Create an immutable decision context
const context = createDecisionContext({ workflowId: 'wf_qa_001' });

// 2. Evaluate risk, impact, and confidence from structured issue data
const risk = evaluateRisk({
  description: 'Correct typo in local variable annotation',
  affectedPaths: ['src/authoring/schema/SchemaValidator.ts'],
  estimatedComplexity: 1,
}, context);

const impact = analyzeImpact({
  filesChanged: 1,
  linesChanged: 2,
  apiChanged: false,
}, context);

const confidence = evaluateConfidence({
  baseScore: 0.95,
  unclearCause: false,
});

// 3. Evaluate safety policy
const policy = evaluateDecisionPolicy({
  riskLevel: risk.riskLevel,
  impactLevel: impact.impactLevel,
  confidenceScore: confidence.score,
  linesChanged: 2,
  category: DecisionCategory.TYPE_FIX,
}, context);

// 4. Create immutable decision result
const decision = createDecisionResult({
  status: policy.status,
  category: DecisionCategory.TYPE_FIX,
  riskAssessment: risk,
  impactAnalysis: impact,
  confidenceEvaluation: confidence,
  reasons: policy.reasons,
  requiredAction: policy.requiredAction,
});

console.log(decision.status); // APPROVED
console.log(decision.requiredAction); // Proceed with automatic repair.

// 5. Aggregate into a DecisionReport
const report = new DecisionReport();
report.addDecision(decision);
console.log(report.format());
console.log(report.serialize());
```
