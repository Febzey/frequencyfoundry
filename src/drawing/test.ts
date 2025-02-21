import { createCanvas } from "canvas";
import * as fs from "fs";
import { drawErrorRegionPolygon } from "./drawPolygon";
import { Point, buildErrorRegion } from "./polygonUtils";
import { generateExplosionLocation } from "../cracking/build_test_utils";
import { generateGridObservationsForN } from "../cracking/generators";
import { triangulateEventLinear } from "../cracking/triangulation";


/**
 * The basic ray data: each has an origin (playerX, playerZ) and a point on the ray (relX, relZ).
 */
export interface RayInput {
  playerX: number;
  playerZ: number;
  relX: number;
  relZ: number;
}

/**
 * Data for the estimated intersection, error radius, offsets, and optionally an "actual" intersection.
 */
export interface IntersectionData {
  estimatedX: number;
  estimatedZ: number;
  errorRadius: number;
  offsets: Array<{ dx: number; dz: number }>;

  // Optionally show an actual intersection (e.g., the known correct point)
  actualX?: number;
  actualZ?: number;
}

/**
 * Helper type for bounding box.
 */
interface BoundingBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 1) Compute the bounding box for all relevant data:
 *    - All ray origins
 *    - All "rel + offset" endpoints
 *    - The estimated intersection ± errorRadius
 *    - (Optional) any additional points you want to ensure are visible
 */
export function computeBoundingBox(
  inputs: RayInput[],
  data: IntersectionData
): BoundingBox {
  let minX = Infinity,
    maxX = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  // Include all player origins
  for (const { playerX, playerZ } of inputs) {
    minX = Math.min(minX, playerX);
    maxX = Math.max(maxX, playerX);
    minZ = Math.min(minZ, playerZ);
    maxZ = Math.max(maxZ, playerZ);
  }

  // Include rel + offsets
  for (let i = 0; i < inputs.length; i++) {
    const { relX, relZ } = inputs[i];
    const { dx, dz } = data.offsets[i];
    const adjX = relX + dx;
    const adjZ = relZ + dz;
    minX = Math.min(minX, adjX);
    maxX = Math.max(maxX, adjX);
    minZ = Math.min(minZ, adjZ);
    maxZ = Math.max(maxZ, adjZ);
  }

  // Include estimated intersection ± errorRadius
  const { estimatedX, estimatedZ, errorRadius } = data;
  minX = Math.min(minX, estimatedX - errorRadius);
  maxX = Math.max(maxX, estimatedX + errorRadius);
  minZ = Math.min(minZ, estimatedZ - errorRadius);
  maxZ = Math.max(maxZ, estimatedZ + errorRadius);

  // Include actual intersection if provided
  if (data.actualX !== undefined && data.actualZ !== undefined) {
    minX = Math.min(minX, data.actualX);
    maxX = Math.max(maxX, data.actualX);
    minZ = Math.min(minZ, data.actualZ);
    maxZ = Math.max(maxZ, data.actualZ);
  }

  return { minX, maxX, minZ, maxZ };
}

export function findMidpoint(inputs: RayInput[]) {
  let sumX = 0;
  let sumZ = 0;
  for (const { playerX, playerZ } of inputs) {
    sumX += playerX;
    sumZ += playerZ;
  }
  return { x: sumX / inputs.length, z: sumZ / inputs.length };
}

/**
 * 2) Convert from (world X,Z) to (canvas x,y).
 *    We invert Z because Canvas y grows downward.
 */
export function toCanvasCoords(
  x: number,
  z: number,
  bbox: BoundingBox,
  canvasWidth: number,
  canvasHeight: number,
  padding: number
) {
  const { minX, maxX, minZ, maxZ } = bbox;
  const drawWidth = canvasWidth - padding * 2;
  const drawHeight = canvasHeight - padding * 2;

  const scaleX = drawWidth / (maxX - minX);
  const scaleY = drawHeight / (maxZ - minZ);

  const cx = padding + (x - minX) * scaleX;
  const cy = canvasHeight - padding - (z - minZ) * scaleY;
  return { x: cx, y: cy };
}

/**
 * 3) Clip an infinite ray against the bounding box.
 *    Ray param eqn: R(t) = O + t*D, for t >= 0.
 *    We find tMin >= 0 and tMax (the portion within the box).
 */
function getRayInBoundingBox(
  Ox: number,
  Oz: number,
  Dx: number,
  Dz: number,
  bbox: BoundingBox
): null | { startX: number; startZ: number; endX: number; endZ: number } {
  const { minX, maxX, minZ, maxZ } = bbox;
  let tMin = 0;
  let tMax = Infinity;

  // X dimension
  if (Math.abs(Dx) < 1e-12) {
    // parallel in X => must be within [minX, maxX]
    if (Ox < minX || Ox > maxX) return null;
  } else {
    const t1 = (minX - Ox) / Dx;
    const t2 = (maxX - Ox) / Dx;
    const low = Math.min(t1, t2);
    const high = Math.max(t1, t2);
    tMin = Math.max(tMin, low);
    tMax = Math.min(tMax, high);
  }

  // Z dimension
  if (Math.abs(Dz) < 1e-12) {
    // parallel in Z => must be within [minZ, maxZ]
    if (Oz < minZ || Oz > maxZ) return null;
  } else {
    const t3 = (minZ - Oz) / Dz;
    const t4 = (maxZ - Oz) / Dz;
    const low = Math.min(t3, t4);
    const high = Math.max(t3, t4);
    tMin = Math.max(tMin, low);
    tMax = Math.min(tMax, high);
  }

  if (tMax < tMin) return null;

  const startX = Ox + tMin * Dx;
  const startZ = Oz + tMin * Dz;
  const endX = Ox + tMax * Dx;
  const endZ = Oz + tMax * Dz;
  return { startX, startZ, endX, endZ };
}

/**
 * 4) Draw a single extended ray (culled to bounding box).
 *    Also optionally draws the origin (blue dot) and endpoint (red dot).
 */
function drawRay(
  ctx: CanvasRenderingContext2D,
  input: RayInput,
  offset: { dx: number; dz: number },
  bbox: BoundingBox,
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
  drawPoints = true,
  strokeStyle = "green"
) {
  const { playerX, playerZ, relX, relZ } = input;
  const { dx, dz } = offset;

  // Ray origin and direction
  const Ox = playerX;
  const Oz = playerZ;
  const Dx = (relX + dx) - playerX;
  const Dz = (relZ + dz) - playerZ;

  // Clip
  const segment = getRayInBoundingBox(Ox, Oz, Dx, Dz, bbox);
  if (segment) {
    const { startX, startZ, endX, endZ } = segment;
    const start = toCanvasCoords(startX, startZ, bbox, canvasWidth, canvasHeight, padding);
    const end = toCanvasCoords(endX, endZ, bbox, canvasWidth, canvasHeight, padding);

    // Draw extended line
    ctx.strokeStyle = strokeStyle;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  // Optionally mark the origin and the "rel + offset" point
  if (drawPoints) {
    // Origin
    const originCanvas = toCanvasCoords(Ox, Oz, bbox, canvasWidth, canvasHeight, padding);
    ctx.fillStyle = "blue";
    ctx.beginPath();
    ctx.arc(originCanvas.x, originCanvas.y, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Endpoint
    const endpointCanvas = toCanvasCoords(relX + dx, relZ + dz, bbox, canvasWidth, canvasHeight, padding);
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(endpointCanvas.x, endpointCanvas.y, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/**
 * 5) Main function to generate the graph.
 *    - Creates the canvas
 *    - Computes bounding box
 *    - Draws all rays, intersection points, etc.
 *    - Saves the final image
 */
export function generateGraph(
  inputs: RayInput[],
  data: IntersectionData,
  outputFile: string
) {
  // 1) Compute bounding box
  const bbox = computeBoundingBox(inputs, data);


  // 2) Create canvas
  const canvasWidth = 4000;
  const canvasHeight = 4000;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  const padding = 50;

  const rawMidpoint = findMidpoint(inputs);
  const midpoint = toCanvasCoords(rawMidpoint.x, rawMidpoint.z, bbox, canvasWidth, canvasHeight, padding);

  // 3) Fill background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 4) Optionally draw axes if (0,0) in bounding box
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  if (bbox.minX < 0 && bbox.maxX > 0) {
    const zeroX = toCanvasCoords(0, 0, bbox, canvasWidth, canvasHeight, padding).x;
    ctx.beginPath();
    ctx.moveTo(zeroX, padding);
    ctx.lineTo(zeroX, canvasHeight - padding);
    ctx.stroke();
  }
  if (bbox.minZ < 0 && bbox.maxZ > 0) {
    const zeroY = toCanvasCoords(0, 0, bbox, canvasWidth, canvasHeight, padding).y;
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    ctx.lineTo(canvasWidth - padding, zeroY);
    ctx.stroke();
  }

  // 5a) Draw each ray (extended)
  ctx.lineWidth = 2;
  for (let i = 0; i < inputs.length; i++) {
    for (let dD = 0; dD <= 1; dD ++) {
      drawRay(
        ctx as any,
        inputs[i],
        {dx: dD, dz: dD},
        bbox,
        canvasWidth,
        canvasHeight,
        padding,
        false,
        dD === 0 ? 'green' : 'blue'
      );
    }

    drawRay(
      ctx as any,
      inputs[i],
      data.offsets[i],
      bbox,
      canvasWidth,
      canvasHeight,
      padding,
      true,
      'red'
    );
   
  }

  // 6) Draw the estimated intersection (purple)
  const { estimatedX, estimatedZ, errorRadius } = data;
  const est = toCanvasCoords(estimatedX, estimatedZ, bbox, canvasWidth, canvasHeight, padding);
  ctx.fillStyle = "purple";
  ctx.beginPath();
  ctx.arc(est.x, est.y, 5, 0, 2 * Math.PI);
  ctx.fill();

  // 7) Draw error circle around the estimated intersection
  ctx.strokeStyle = "purple";
  ctx.lineWidth = 2;
  const drawWidth = canvasWidth - padding * 2;
  const drawHeight = canvasHeight - padding * 2;
  const scaleX = drawWidth / (bbox.maxX - bbox.minX);
  const scaleY = drawHeight / (bbox.maxZ - bbox.minZ);
  const radiusX = errorRadius * scaleX;
  const radiusY = errorRadius * scaleY;
  ctx.beginPath();
  ctx.ellipse(est.x, est.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
  ctx.stroke();

  // 8) If an actual intersection is provided, draw it in red
  if (data.actualX !== undefined && data.actualZ !== undefined) {
    const actual = toCanvasCoords(
      data.actualX,
      data.actualZ,
      bbox,
      canvasWidth,
      canvasHeight,
      padding
    );
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(actual.x, actual.y, 5, 0, 2 * Math.PI);
    ctx.fill();

    // 8b) draw a line from actual to midpoint
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(actual.x, actual.y);
    ctx.lineTo(midpoint.x, midpoint.y);
    ctx.stroke();

  }

  const polygon: Point[] = buildErrorRegion(inputs)
  // Draw polygon.
  ctx.beginPath();
  const first = toCanvasCoords(polygon[0].x, polygon[0].z, bbox, canvasWidth, canvasHeight, padding);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < polygon.length; i++) {
    const pt = toCanvasCoords(polygon[i].x, polygon[i].z, bbox, canvasWidth, canvasHeight, padding);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();

  // Fill the polygon with a semi-transparent red.
  ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
  ctx.fill();

  // Outline the polygon in red.
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.stroke();

  // 9) Save the image
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputFile, buffer);
  console.log(`Graph image saved as ${outputFile}`);
}


const minRadius = 1000
const maxRadius = 10000
const maxBotRadius = 5000
const viewDistance = 160

const actual = generateExplosionLocation(minRadius, maxRadius)

//
// 1) Your Data
//
const inputs: RayInput[] = generateGridObservationsForN(4, maxBotRadius, actual.x, actual.z, viewDistance);

const out = triangulateEventLinear(inputs)
if (out == null) {
  console.log("Triangulation failed.");
  process.exit(1)
}

const offsets = []
for (let i = 0; i < inputs.length; i++) {
  offsets.push({ dx: 0.5, dz: 0.5 });
}
const found = {
  ...out,
  offsets: offsets,
  actualX: actual.x,
  actualZ: actual.z
}

generateGraph(inputs, found, "output.png");
