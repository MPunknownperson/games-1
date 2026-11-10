/// <reference lib="webworker" />
import { parseCollision, parseVisual, type CellJob, type CellResult } from './cellArchive';

self.onmessage = (event: MessageEvent<CellJob>) => {
  const { key, revision, refs } = event.data;
  const collision = parseCollision(refs);
  const collisionResult: CellResult = { key, revision, stage: 'collision', layer: collision };
  self.postMessage(collisionResult, { transfer: [collision.heights.buffer, collision.bodies.buffer] });
  const visual = parseVisual(refs);
  const visualResult: CellResult = { key, revision, stage: 'visual', layer: visual };
  self.postMessage(visualResult);
};