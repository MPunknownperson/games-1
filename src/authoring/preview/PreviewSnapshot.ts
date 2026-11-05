/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewSnapshot.ts provides immutable snapshots of a preview tree at a
 * point in time. Snapshots record a timestamp, source identifier, version
 * info, and the serialised tree. They support comparison and JSON export.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PreviewTree } from './PreviewTree';

/** Version information attached to a snapshot. */
export interface SnapshotVersion {
  readonly toolchainVersion?: string;
  readonly schemaVersion?: string;
  readonly backendVersion?: string;
}

/** Serializable data payload of a preview snapshot. */
export interface SnapshotData {
  /** ISO-8601 timestamp when the snapshot was captured. */
  readonly timestamp: string;
  /** Identifier of the source data this snapshot represents. */
  readonly sourceId: string;
  /** Toolchain and input version information. */
  readonly version: SnapshotVersion;
  /** Serialised preview tree ({ nodes, rootId }). */
  readonly treeData: { nodes: Record<string, unknown>; rootId?: string };
  /** Total number of nodes in the tree. */
  readonly nodeCount: number;
}

/**
 * Immutable snapshot of a preview tree.
 * Once created, the data cannot be modified.
 */
export class PreviewSnapshot {
  readonly timestamp: string;
  readonly sourceId: string;
  readonly version: SnapshotVersion;
  readonly treeData: { nodes: Record<string, unknown>; rootId?: string };
  readonly nodeCount: number;

  constructor(data: SnapshotData) {
    this.timestamp = data.timestamp;
    this.sourceId = data.sourceId;
    this.version = { ...data.version };
    this.treeData = {
      nodes: data.treeData.nodes,
      rootId: data.treeData.rootId,
    };
    this.nodeCount = data.nodeCount;
  }

  /** Create a snapshot from a live PreviewTree. */
  static fromTree(tree: PreviewTree, sourceId: string, version: SnapshotVersion = {}, timestamp?: string): PreviewSnapshot {
    return new PreviewSnapshot({
      timestamp: timestamp ?? new Date().toISOString(),
      sourceId,
      version,
      treeData: tree.toJSON(),
      nodeCount: tree.size(),
    });
  }

  /** Rebuild a snapshot from serialised data. */
  static fromData(data: SnapshotData): PreviewSnapshot {
    return new PreviewSnapshot(data);
  }

  /** Serialize the snapshot to a JSON string. */
  toJSON(pretty = true): string {
    return JSON.stringify(this.serialize(), null, pretty ? 2 : 0);
  }

  /** Return a plain serialisable data object. */
  serialize(): SnapshotData {
    return {
      timestamp: this.timestamp,
      sourceId: this.sourceId,
      version: this.version,
      treeData: this.treeData,
      nodeCount: this.nodeCount,
    };
  }
}

/**
 * Compare two snapshots and return a summary of differences.
 * Comparison covers: node count, source identity, and structural hash.
 */
export function compareSnapshots(a: PreviewSnapshot, b: PreviewSnapshot): { identical: boolean; nodeCountDiff: number; timestampDiff: string } {
  const hashA = hashTreeData(a.treeData);
  const hashB = hashTreeData(b.treeData);
  return {
    identical: a.sourceId === b.sourceId && hashA === hashB,
    nodeCountDiff: b.nodeCount - a.nodeCount,
    timestampDiff: `${a.timestamp} → ${b.timestamp}`,
  };
}

/** Simple deterministic hash of tree data for comparison. */
function hashTreeData(data: { nodes: Record<string, unknown>; rootId?: string }): string {
  return JSON.stringify(data);
}
