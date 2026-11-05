/** Problem analysis for the AI-Assisted Safe Repair Layer. No repair is applied. */
import { inferPolicyRisk } from './SafeRepairPolicy';
import {
  RepairScope,
  type RepairFinding,
  type RepairProblem,
  type RepairRisk,
} from './SafeRepairTypes';

/** Optional hints that refine conservative scope analysis. */
export interface RepairAnalysisHints {
  readonly likelyLocal?: boolean;
  readonly unclearIntent?: boolean;
  readonly explicitScope?: RepairScope;
  readonly explicitRisk?: RepairRisk;
}

/** Analyze a detected problem and produce a normalized finding. */
export function analyzeProblem(
  problem: RepairProblem,
  hints: RepairAnalysisHints = {},
): RepairFinding {
  const paths = uniqueSorted(problem.paths);
  const scope = hints.explicitScope ?? inferScope(problem, paths.length, hints);
  const draft: RepairFinding = {
    issueId: problem.issueId,
    issue: problem.description,
    affectedPaths: paths,
    affectedFiles: paths.length,
    estimatedChanges: Math.max(0, Math.floor(problem.estimatedLines)),
    risk: 'LOW',
    scope,
    apiImpact: problem.apiImpact ?? false,
    dependencyImpact: problem.dependencyImpact ?? false,
    architectureImpact: problem.architectureImpact ?? false,
    runtimeImpact: problem.runtimeImpact ?? false,
  };
  return { ...draft, risk: hints.explicitRisk ?? inferPolicyRisk(draft) };
}

/** Infer scope from impact flags, affected files, and estimated changes. */
function inferScope(
  problem: RepairProblem,
  affectedFiles: number,
  hints: RepairAnalysisHints,
): RepairScope {
  if (problem.runtimeImpact || problem.architectureImpact) return RepairScope.LARGE;
  if (problem.apiImpact || problem.dependencyImpact || hints.unclearIntent) return RepairScope.MODERATE;
  if (affectedFiles > 3 || problem.estimatedLines > 50) return RepairScope.MODERATE;
  if (affectedFiles <= 1 && problem.estimatedLines <= 5 && hints.likelyLocal !== false) {
    return RepairScope.TRIVIAL;
  }
  return RepairScope.SMALL;
}

/** Return unique paths sorted for deterministic output. */
function uniqueSorted(paths: readonly string[]): readonly string[] {
  return Array.from(new Set(paths.map((path) => path.replace(/\\/g, '/')))).sort();
}

/** Analyze several problems in stable issue-id order. */
export function analyzeProblems(
  problems: readonly RepairProblem[],
): readonly RepairFinding[] {
  return [...problems]
    .sort((a, b) => a.issueId.localeCompare(b.issueId))
    .map((problem) => analyzeProblem(problem));
}