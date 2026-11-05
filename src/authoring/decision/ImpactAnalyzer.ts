/**
 * PRESERVE Authoring System — AI Decision & Confidence Layer.
 *
 * ImpactAnalyzer.ts analyzes the possible architectural and filesystem impact
 * of a repair request or proposed change.
 *
 * It does NOT inspect the real filesystem or run code. It only consumes
 * structured metric inputs (files changed, lines changed, dependency flags,
 * API change flags) to determine the impact level and affected scope.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { DEFAULT_DECISION_CONTEXT, type DecisionContext } from './DecisionContext';
import { ImpactLevel } from './DecisionTypes';

/** Structured input describing the estimated or proposed scope of a change. */
export interface ImpactInput {
  /** Number of files touched or estimated to be touched. Defaults to 1. */
  readonly filesChanged?: number;
  /** Total number of lines modified across all files. Defaults to 0. */
  readonly linesChanged?: number;
  /** Whether package or internal module dependencies are modified. Defaults to false. */
  readonly dependencyChanged?: boolean;
  /** Whether public exported interfaces or APIs are modified. Defaults to false. */
  readonly apiChanged?: boolean;
  /** Whether architectural boundaries or system patterns are modified. Defaults to false. */
  readonly architectureChanged?: boolean;
  /** Number of distinct authoring modules touched. Defaults to 1. */
  readonly moduleCount?: number;
}

/** Evaluated impact analysis outcome. */
export interface ImpactAnalysis {
  /** Classified impact level (SINGLE_FILE, MULTIPLE_FILES, MODULE_LEVEL, SYSTEM_LEVEL). */
  readonly impactLevel: ImpactLevel;
  /** Coarse affected scope classification: 'local', 'module', or 'system'. */
  readonly affectedScope: 'local' | 'module' | 'system';
  /** Human-readable explanation justifying the impact classification. */
  readonly explanation: string;
  /** True when the change is considered high impact (system level or API/dependency change). */
  readonly isHighImpact: boolean;
}

/**
 * Analyze the possible impact of a repair request based on structured metrics.
 *
 * Rules:
 * - 1 file + <50 lines + no API/dependency/arch change -> SINGLE_FILE ('local', low impact)
 * - Multiple files (<=3) or 50..100 lines -> MULTIPLE_FILES / MODULE_LEVEL ('module', medium impact)
 * - Architecture/dependency/API changes or >3 files -> SYSTEM_LEVEL / MODULE_LEVEL ('system', high impact)
 */
export function analyzeImpact(
  input: ImpactInput,
  context: DecisionContext = DEFAULT_DECISION_CONTEXT,
): ImpactAnalysis {
  const files = Math.max(0, Math.floor(input.filesChanged ?? 1));
  const lines = Math.max(0, Math.floor(input.linesChanged ?? 0));
  const depChanged = input.dependencyChanged ?? false;
  const apiChanged = input.apiChanged ?? false;
  const archChanged = input.architectureChanged ?? false;
  const modules = Math.max(1, Math.floor(input.moduleCount ?? 1));
  const maxLines = context.policyConfiguration.maxAutoLinesChanged;

  if (archChanged || depChanged) {
    const reason = archChanged
      ? 'Architectural modifications affect system-wide boundaries.'
      : 'Dependency modifications affect project build and module wiring.';
    return {
      impactLevel: ImpactLevel.SYSTEM_LEVEL,
      affectedScope: 'system',
      explanation: `High impact: ${reason}`,
      isHighImpact: true,
    };
  }

  if (apiChanged || modules > 2 || files > 5) {
    const reason = apiChanged
      ? 'Public API changes affect downstream callers across modules.'
      : `Change touches ${files} files across ${modules} modules.`;
    return {
      impactLevel: modules > 2 || files > 10 ? ImpactLevel.SYSTEM_LEVEL : ImpactLevel.MODULE_LEVEL,
      affectedScope: 'system',
      explanation: `High impact: ${reason}`,
      isHighImpact: true,
    };
  }

  if (files > 1 || lines >= maxLines || modules > 1) {
    const desc = files > 1 ? `Multiple files (${files}) touched` : `Line count (${lines}) is moderate`;
    return {
      impactLevel: modules > 1 ? ImpactLevel.MODULE_LEVEL : ImpactLevel.MULTIPLE_FILES,
      affectedScope: 'module',
      explanation: `Medium impact: ${desc} within localized module scope.`,
      isHighImpact: lines >= maxLines * 2,
    };
  }

  return {
    impactLevel: ImpactLevel.SINGLE_FILE,
    affectedScope: 'local',
    explanation: `Low impact: local modification within 1 file (${lines} lines, no API change).`,
    isHighImpact: false,
  };
}
