/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewSession.ts manages a preview inspection session: creation, tree
 * attachment, snapshot updates, closure, and status tracking. Each session
 * is a self-contained instance with no global mutable state.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PreviewNode } from './PreviewNode';
import type { PreviewStatus } from './PreviewTypes';
import { PreviewSnapshot, compareSnapshots, type SnapshotVersion } from './PreviewSnapshot';
import { PreviewTree } from './PreviewTree';

/** Metadata returned when querying a session. */
export interface SessionInfo {
  readonly id: string;
  readonly status: PreviewStatus;
  readonly treeSize: number;
  readonly snapshotCount: number;
  readonly lastSnapshotAt?: string;
}

/**
 * A self-contained preview inspection session.
 * Holds a tree, a history of snapshots, and tracks lifecycle status.
 */
export class PreviewSession {
  readonly id: string;
  private tree: PreviewTree | null = null;
  private snapshots: PreviewSnapshot[] = [];
  private status: PreviewStatus = 'BUILDING';
  private sourceId = '';
  private version: SnapshotVersion = {};

  constructor(id: string) {
    this.id = id;
  }

  /** Current session lifecycle status. */
  getStatus(): PreviewStatus {
    return this.status;
  }

  /** Attach or replace the preview tree for this session. */
  attachTree(newTree: PreviewTree, sourceId: string, version?: SnapshotVersion): void {
    if (this.status === 'CLOSED') return;
    this.tree = newTree;
    this.sourceId = sourceId;
    this.version = version ? { ...version } : {};
    this.updateSnapshot();
    this.status = 'READY';
  }

  /** Retrieve the current tree. */
  getTree(): PreviewTree | null {
    return this.tree;
  }

  /** Capture the current tree state as an immutable snapshot. */
  updateSnapshot(timestamp?: string): PreviewSnapshot | null {
    if (!this.tree) return null;
    const snap = PreviewSnapshot.fromTree(this.tree, this.sourceId, this.version, timestamp);
    this.snapshots.push(snap);
    if (this.snapshots.length > 1) this.status = 'STALE';
    return snap;
  }

  /** All snapshots captured during this session, in order. */
  getSnapshots(): readonly PreviewSnapshot[] {
    return [...this.snapshots];
  }

  /** Compare the two most recent snapshots. */
  compareLastSnapshots(): { identical: boolean; nodeCountDiff: number } | null {
    if (this.snapshots.length < 2) return null;
    const a = this.snapshots[this.snapshots.length - 2];
    const b = this.snapshots[this.snapshots.length - 1];
    const result = compareSnapshots(a, b);
    return { identical: result.identical, nodeCountDiff: result.nodeCountDiff };
  }

  /** Export the latest snapshot as JSON. */
  exportSnapshot(pretty = true): string | null {
    const latest = this.snapshots[this.snapshots.length - 1];
    return latest ? latest.toJSON(pretty) : null;
  }

  /** Search nodes in the current tree by display name. */
  search(substring: string): readonly PreviewNode[] {
    if (!this.tree) return [];
    return this.tree.search(substring);
  }

  /** Close the session, releasing references and locking further changes. */
  close(): void {
    this.status = 'CLOSED';
    this.tree = null;
    this.snapshots = [];
  }

  /** Summary information about the session. */
  info(): SessionInfo {
    return {
      id: this.id,
      status: this.status,
      treeSize: this.tree?.size() ?? 0,
      snapshotCount: this.snapshots.length,
      lastSnapshotAt: this.snapshots[this.snapshots.length - 1]?.timestamp,
    };
  }
}

/** Create a new preview session with a unique identifier. */
export function createPreviewSession(id?: string): PreviewSession {
  const uid = id ?? `session_${Date.now().toString(36)}`;
  return new PreviewSession(uid);
}
