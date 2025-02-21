// canvasUtils.ts
import { Point } from "./polygonUtils";

export interface BoundingBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Given an array of points, compute the bounding box.
 */
export function computeBoundingBox(points: Point[]): BoundingBox {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Convert a world coordinate (x, z) to canvas coordinates (x, y).
 * Note: Canvas y increases downward.
 */
export function toCanvasCoords(
  x: number,
  z: number,
  bbox: BoundingBox,
  canvasWidth: number,
  canvasHeight: number,
  padding: number
): { x: number; y: number } {
  const { minX, maxX, minZ, maxZ } = bbox;
  const drawWidth = canvasWidth - padding * 2;
  const drawHeight = canvasHeight - padding * 2;
  const scaleX = drawWidth / (maxX - minX);
  const scaleY = drawHeight / (maxZ - minZ);
  return {
    x: padding + (x - minX) * scaleX,
    y: canvasHeight - (padding + (z - minZ) * scaleY),
  };
}