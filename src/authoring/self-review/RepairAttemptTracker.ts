/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * RepairAttemptTracker.ts maintains an immutable history of controlled repair
 * attempts. Every mutation returns a new tracker instance; no internal state is
 * mutated in place. There is no global storage.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SelfReviewContext } from './SelfReviewContext';
import {
  RepairAttemptStatus,
  type ChangeSummary,
  type RepairAttempt,
} from './SelfReviewTypes';

/** Input used to record a new attempt. */
export interface AttemptRecordInput {
  /** Status of the attempt. */
  readonly status: RepairAttemptStatus;
  /** Change scope attempted. */
  readonly changeSummary: ChangeSummary;
  /** Concise error summary, when failed. */
  readonly errorSummary?: string;
  /** Whether verification passed after the attempt. */
  readonly verificationPassed: boolean;
  /** Optional timestamp; defaults to context timestamp. */
  readonly timestamp?: string;
}

/** Immutable, append-only history of repair attempts. */
export class RepairAttemptTracker {
  private readonly attemptsList: readonly RepairAttempt[];

  constructor(attempts: readonly RepairAttempt[] = []) {
    this.attemptsList = [...attempts];
  }

  /** All recorded attempts, in ascending attempt-number order. */
  list(): readonly RepairAttempt[] {
    return [...this.attemptsList].sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  /** Number of attempts recorded. */
  count(): number {
    return this.attemptsList.length;
  }

  /** Number of attempts that failed. */
  failedCount(): number {
    return this.attemptsList.filter((a) => a.status === RepairAttemptStatus.FAILED).length;
  }

  /** The most recent attempt, or undefined when empty. */
  latest(): RepairAttempt | undefined {
    const sorted = this.list();
    return sorted[sorted.length - 1];
  }

  /** Number of retries used so far (attempts minus the first attempt). */
  retryCount(): number {
    return Math.max(0, this.attemptsList.length - 1);
  }

  /** Whether the retry limit has been reached or exceeded. */
  isRetryLimitReached(context: SelfReviewContext): boolean {
    return this.retryCount() >= context.maximumRetryCount;
  }

  /** Return a new tracker with one additional attempt appended. */
  withAttempt(input: AttemptRecordInput, context: SelfReviewContext): RepairAttemptTracker {
    const attempt: RepairAttempt = {
      attemptNumber: this.attemptsList.length + 1,
      status: input.status,
      changeSummary: { ...input.changeSummary, paths: [...input.changeSummary.paths] },
      errorSummary: input.errorSummary,
      verificationPassed: input.verificationPassed,
      recordedAt: input.timestamp ?? context.timestamp,
    };
    return new RepairAttemptTracker([...this.attemptsList, attempt]);
  }

  /** Whether the most recent attempt failed. */
  latestFailed(): boolean {
    const latest = this.latest();
    return latest?.status === RepairAttemptStatus.FAILED;
  }

  /** Serialize the history to a deterministic JSON string. */
  serialize(pretty = true): string {
    return JSON.stringify(this.list(), null, pretty ? 2 : 0);
  }

  /** Rebuild a tracker from a serialized attempt list. */
  static fromAttempts(attempts: readonly RepairAttempt[]): RepairAttemptTracker {
    return new RepairAttemptTracker(attempts);
  }
}
