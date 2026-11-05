# PRESERVE Authoring — Test & QA Evidence Layer

An isolated infrastructure layer for describing, collecting, validating, and
serializing quality assurance test evidence. This is **not a CI system** and
**not a test execution engine**. It never runs shell commands, compilers,
filesystems, network requests, git operations, or deployments.

## Architecture

```
TestPlan
  ↓
TestRunner (PLAN_ONLY / DRY_RUN / EVIDENCE_ONLY)
  ↓
TestEvidenceCollector (externally supplied data)
  ↓
QATestReport
  ↓
Verification Layer (consumes report evidence)
  ↓
Safe Repair Layer (consumes repair recommendations)
```

## Why this is not a CI system

A CI system triggers builds, runs compilers, executes test suites, manages
runners, and deploys artifacts. This layer does none of those things. External
tooling (npm, tsc, Vitest, the verification layer, etc.) executes the actual
work and supplies outcomes as structured evidence. The QA Evidence Layer only
describes what should be checked, collects the results, validates structural
completeness, and produces a serializable report.

## Why this does not execute commands

Every quality dimension (BUILD, TYPECHECK, LINT, UNIT, INTEGRATION, STRUCTURE,
SERIALIZATION, ISOLATION) is evaluated by its own external system. This layer
defines what evidence must exist and whether it passed; it never invokes
`child_process`, `fs`, `net`, or any other system API.

## How future CI integration could be added

A future CI adapter module (outside this layer) could:
1. Read a `TestPlan` to know which categories of evidence are required.
2. Execute the external tools (build, type-check, lint, test suite).
3. Feed raw outcomes into `TestEvidenceCollector`.
4. Run the `TestRunner` in EVIDENCE_ONLY mode with the collected evidence.
5. Serialize the `QATestReport` and pass it to downstream consumers.

This layer's contracts remain unchanged; only the adapter is new.

## How Verification and Safe Repair consume reports

- **Verification Layer**: A `VerificationReport` can embed QA evidence as
  build-outcome descriptors. The QA evidence categories (BUILD, TYPECHECK)
  align directly with the verification layer's built-in checks.
- **Safe Repair Layer**: The `QARepairRecommendation` entries surfaced by
  `QATestReport.getRepairRecommendations()` map directly to the safe-repair
  analyzer's `RepairProblem` inputs. A future bridge module can translate
  failed QA tests into repair findings without modifying either layer.

## File responsibilities

| File | Description |
| --- | --- |
| `TestingTypes.ts` | Shared contracts: `TestCategory`, `TestStatus`, `TestSeverity`, `TestEvidence`, `TestMetadata`, `TestRequirement`, `TestScope`. |
| `TestCase.ts` | One test definition: id, name, category, target, expectedResult, requiredEvidence, severity, dependencies. No execution logic. |
| `TestPlan.ts` | Deterministic collection of test cases with dependency validation and serialization. |
| `TestResult.ts` | Immutable outcome of one test evaluation: status, errors, warnings, evidence, timestamp. |
| `TestEvidenceCollector.ts` | Collects externally supplied quality evidence (build, type-check, isolation, serialization). Never runs tools. |
| `TestRunner.ts` | Orchestrates evaluation via dependency injection. Supports PLAN_ONLY, DRY_RUN, and EVIDENCE_ONLY modes. Contains no testing logic. |
| `TestReport.ts` | Aggregates results, evidence, and repair recommendations. Supports `toJSON()`, `serialize()`, `format()`. |
| `TestPolicy.ts` | Safety rules: max test count, protected paths, required evidence categories. |
| `TestValidator.ts` | Validates plans and results: missing IDs, duplicates, invalid categories, missing evidence, inconsistent statuses. |

## Quick start

```ts
import { createTestCase } from './TestCase';
import { TestPlan } from './TestPlan';
import { TestEvidenceCollector } from './TestEvidenceCollector';
import { TestRunner, TestRunMode } from './TestRunner';
import { QATestReport } from './TestReport';

// 1. Define test cases
const plan = new TestPlan({ planId: 'qa_001' });
plan.addTest(createTestCase({
  id: 'build.succeeds',
  name: 'Build succeeds',
  description: 'Project build completes without errors.',
  category: 'BUILD',
  target: 'dist/index.html',
  expectedResult: 'Build exits with code 0.',
  requiredEvidence: [{ category: 'BUILD', description: 'Build outcome', mandatory: true }],
}));

// 2. Collect evidence from external tools
const collector = new TestEvidenceCollector();
collector.addBuildEvidence(true, { moduleCount: 41, outputBytes: 320_680 });

// 3. Run evaluation
const runner = new TestRunner();
const outcome = await runner.run(plan, {
  mode: TestRunMode.EVIDENCE_ONLY,
  evidence: collector.list(),
});

// 4. Generate report
const report = new QATestReport();
report.addResults(outcome.results);
report.addAllEvidence(collector.list());
console.log(report.format());
console.log(report.serialize());
```
