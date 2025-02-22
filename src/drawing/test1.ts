import { Geometry, intersection as polyIntersection, union as polyUnion } from "martinez-polygon-clipping";
import { BoundingBox } from "./canvasUtils";

type Observation = {
  playerX: number;
  playerZ: number;
  relX: number;
  relZ: number;
};

type Offset = { dx: number; dz: number };

type CandidateOffsets = {
  min: Offset;
  max: Offset;
};

// The provided function (unchanged) to compute candidate offsets.
export function getCandidateOffsetsForObservation(
  obs: { playerX: number; playerZ: number; relX: number; relZ: number },
  resolution: number = 0.01
): CandidateOffsets {
  const { playerX, playerZ, relX, relZ } = obs;
  let bestPair = { min: { dx: 0, dz: 0 }, max: { dx: 0, dz: 0 } };

  // Store angles for all candidates
  const candidates: { dx: number; dz: number; angle: number }[] = [];

  // Compute angles for all points in [0,1] x [0,1]
  for (let i = 0; i <= 1 / resolution; i++) {
    const dx = i * resolution;
    for (let j = 0; j <= 1 / resolution; j++) {
      const dz = j * resolution;
      const angle = Math.atan2(relZ + dz - playerZ, relX + dx - playerX);
      candidates.push({ dx, dz, angle });
    }
  }

  // Find the pair that maximizes angular difference
  let minCandidate = candidates[0];
  let maxCandidate = candidates[0];

  for (const cand of candidates) {
    if (cand.angle < minCandidate.angle) {
      minCandidate = cand;
    }
    if (cand.angle > maxCandidate.angle) {
      maxCandidate = cand;
    }
  }

  bestPair = {
    min: { dx: minCandidate.dx, dz: minCandidate.dz },
    max: { dx: maxCandidate.dx, dz: maxCandidate.dz },
  };

  return bestPair;
}
/****************************************************
 * 1) Define the bounding box
 ****************************************************/

/****************************************************
 * 2) Ray-box intersection function
 ****************************************************/
/**
 * Returns the forward intersection point of a ray
 * with the axis-aligned bounding box [BOUND_MIN, BOUND_MAX]^2.
 * @param origin [ox, oy] The ray's origin.
 * @param direction [dx, dy] The ray's direction.
 * @returns [ix, iy] The intersection point in front of origin,
 *                   or the origin itself if no forward intersection.
 */
function getRayBoxIntersection(origin: [number, number], direction: [number, number], bbox: BoundingBox): [number, number] {
  const [ox, oy] = origin;
  const [dx, dy] = direction;

  // If the direction is effectively zero, just return the origin
  // (or handle differently if that case shouldn't occur).
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
    return origin;
  }

  // We'll collect all valid intersections as [ix, iy, t].
  // 't' is the parametric distance along the ray:
  //   (ox + t*dx, oy + t*dy)
  const candidates: Array<[number, number, number]> = [];

  // Helper to add an intersection if it's in front (t > 0)
  // and within the bounding box on the other coordinate.
  function maybeAdd(t: number, isVertical: boolean) {
    if (t > 0) {
      const ix = ox + t * dx;
      const iy = oy + t * dy;
      // If it's an intersection with a vertical boundary, check Y is in range.
      // If it's an intersection with a horizontal boundary, check X is in range.
      if (isVertical) {
        if (iy >= bbox.minZ && iy <= bbox.maxZ) {
          candidates.push([ix, iy, t]);
        }
      } else {
        if (ix >= bbox.minX && ix <= bbox.maxX) {
          candidates.push([ix, iy, t]);
        }
      }
    }
  }

  // 2a) Intersect with x = BOUND_MIN and x = BOUND_MAX
  if (Math.abs(dx) > 1e-12) {
    const tMinX = (bbox.minX - ox) / dx;
    maybeAdd(tMinX, true);

    const tMaxX = (bbox.maxX - ox) / dx;
    maybeAdd(tMaxX, true);
  }

  // 2b) Intersect with y = BOUND_MIN and y = BOUND_MAX
  if (Math.abs(dy) > 1e-12) {
    const tMinY = (bbox.minZ - oy) / dy;
    maybeAdd(tMinY, false);

    const tMaxY = (bbox.maxZ - oy) / dy;
    maybeAdd(tMaxY, false);
  }

  // If no forward intersection was found, just return the origin (or handle differently).
  if (candidates.length === 0) {
    return origin;
  }

  // Choose the intersection with the smallest positive t.
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i][2] < best[2]) {
      best = candidates[i];
    }
  }

  return [best[0], best[1]];
}

/**
 * Builds a wedge (triangle) polygon for the given observation
 * by extending two boundary rays to the bounding box.
 * @param obs The observation with player coords and relative coords.
 * @returns A polygon in the format expected by martinez-polygon-clipping:
 *          [ [ [x0, y0], [x1, y1], [x2, y2], [x0, y0] ] ]
 */
export function buildConePolygon(obs: Observation, bbox: BoundingBox): number[][][] {
  const offsets = getCandidateOffsetsForObservation(obs);
  const player: [number, number] = [obs.playerX, obs.playerZ];

  // Boundary points = (relX + offset, relZ + offset)
  const minPoint: [number, number] = [obs.relX + offsets.min.dx, obs.relZ + offsets.min.dz];
  const maxPoint: [number, number] = [obs.relX + offsets.max.dx, obs.relZ + offsets.max.dz];

  // Direction vectors from player to each boundary point
  const minDir: [number, number] = [minPoint[0] - player[0], minPoint[1] - player[1]];
  const maxDir: [number, number] = [maxPoint[0] - player[0], maxPoint[1] - player[1]];

  // Extend each direction to the bounding box
  const extendedMin = getRayBoxIntersection(player, minDir, bbox);
  const extendedMax = getRayBoxIntersection(player, maxDir, bbox);

  // Build a triangle polygon: apex + 2 extended points
  const conePolygon = [player, extendedMin, extendedMax, player];
  return [conePolygon];
}

function cleanPolygon(polygon: number[][][]): number[][][] {
  // polygon is an array of rings
  const cleanedRings = polygon
    .map((ring) => {
      // ring must have at least 4 coordinates
      // and ring[0] should match ring[ring.length-1]
      if (ring.length < 4) return null;
      // optionally also check if the ring has area > 0
      return ring;
    })
    .filter(Boolean) as number[][][];

  return cleanedRings.length > 0 ? cleanedRings : [];
}

function cleanMultiPolygon(multi: number[][][][]): number[][][][] {
  // multi is an array of polygons
  const cleanedPolygons = multi
    .map((poly) => {
      const c = cleanPolygon(poly);
      return c.length > 0 ? c : null;
    })
    .filter(Boolean) as number[][][][];
  return cleanedPolygons.length > 0 ? cleanedPolygons : [];
}

function closeRing(ring: number[][]): number[][] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]); // repeat the first point
  }
  return ring;
}

// Given an array of observations, compute the union of all pairwise intersections
// (i.e. the region covered by at least two cones).
export function computeOverlappingRegion(observations: Observation[], bbox: BoundingBox): Geometry | null {
  // Build all cone polygons.

 // First, build and clean the cone polygons.
const cones = observations
.map((obs) => buildConePolygon(obs, bbox))
.map(cleanPolygon);

// Then, ensure each ring in each polygon is properly closed.
cones.forEach((polygon) => {
polygon.forEach(closeRing);
});

  const pairIntersections: Geometry[] = [];

  // Compute pairwise intersections.
  for (let i = 0; i < cones.length; i++) {
    for (let j = i + 1; j < cones.length; j++) {
      const polyA = cones[i];
      const polyB = cones[j];
      const inter = polyIntersection(polyA, polyB);
      if (inter) {
        pairIntersections.push(inter);
      }
    }
  }

  // console.log(JSON.stringify(pairIntersections));

  // If no intersections, return null.
  if (pairIntersections.length === 0) {
    return null;
  }

  // Union all pairwise intersections.
  let overlappingRegion = pairIntersections[0];
  for (let k = 1; k < pairIntersections.length; k++) {
    overlappingRegion = polyUnion(overlappingRegion, pairIntersections[k]);
  }
  return overlappingRegion;
}

/* ===== Example Usage ===== */
const observations: Observation[] = [
  { playerX: 100, playerZ: 100, relX: 150, relZ: 150 },
  { playerX: 120, playerZ: 80, relX: 170, relZ: 130 },
  { playerX: 90, playerZ: 110, relX: 140, relZ: 160 },
];
