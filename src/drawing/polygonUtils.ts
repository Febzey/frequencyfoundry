// polygonUtils.ts
export interface Observation {
    playerX: number;
    playerZ: number;
    relX: number;
    relZ: number;
  }
export interface Point {
  x: number;
  z: number;
}

export interface HalfPlane {
  a: number;
  b: number;
  c: number;
}

/**
 * Returns the signed distance from point p to the line for halfPlane hp.
 */
function signedDistance(p: Point, hp: HalfPlane): number {
  return hp.a * p.x + hp.b * p.z - hp.c;
}

/**
 * Intersects a polygon with a half-plane defined by hp: a*x + b*z <= c.
 */
function clipPolygonAgainstHalfPlane(polygon: Point[], hp: HalfPlane): Point[] {
  const n = polygon.length;
  if (n === 0) return [];
  const clipped: Point[] = [];
  for (let i = 0; i < n; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    const currInside = signedDistance(curr, hp) <= 0;
    const nextInside = signedDistance(next, hp) <= 0;
    if (currInside) {
      clipped.push(curr);
    }
    if (currInside !== nextInside) {
      const dx = next.x - curr.x;
      const dz = next.z - curr.z;
      const denom = hp.a * dx + hp.b * dz;
      if (Math.abs(denom) > 1e-12) {
        const alpha = (hp.c - (hp.a * curr.x + hp.b * curr.z)) / denom;
        if (alpha >= 0 && alpha <= 1) {
          clipped.push({ x: curr.x + alpha * dx, z: curr.z + alpha * dz });
        }
      }
    }
  }
  return clipped;
}

/**
 * Intersects a list of half-planes (each in form a*x + b*z <= c) and returns the intersection polygon.
 */
export function intersectHalfPlanes(hpList: HalfPlane[]): Point[] {
  let polygon: Point[] = [
    { x: -1e9, z: -1e9 },
    { x:  1e9, z: -1e9 },
    { x:  1e9, z:  1e9 },
    { x: -1e9, z:  1e9 },
  ];
  for (const hp of hpList) {
    polygon = clipPolygonAgainstHalfPlane(polygon, hp);
    if (polygon.length === 0) break;
  }
  return polygon;
}

/**
 * Given an observation, computes its wedge constraints.
 * For each observation, we compute the angles to the four corners of the 1×1 square:
 *   [relX, relX+1) x [relZ, relZ+1)
 * and then derive two half-planes (one for the minimum angle and one for the maximum angle).
 * For simplicity, here we assume the feasible region is defined by the two lines at θmin and θmax,
 * with the "inside" determined by testing a midpoint.
 */
export function getWedgeHalfPlanes(obs: Observation): HalfPlane[] {
  const P: Point = { x: obs.playerX, z: obs.playerZ };
  const corners: Point[] = [
    { x: obs.relX,     z: obs.relZ },
    { x: obs.relX + 1, z: obs.relZ },
    { x: obs.relX,     z: obs.relZ + 1 },
    { x: obs.relX + 1, z: obs.relZ + 1 },
  ];
  const angles = corners.map(c => Math.atan2(c.z - P.z, c.x - P.x));
  const thetaMin = Math.min(...angles);
  const thetaMax = Math.max(...angles);

  // Build lines (in normal form) from P at thetaMin and thetaMax.
  const lineFromPoint = (theta: number): HalfPlane => {
    const nx = -Math.sin(theta);
    const nz = Math.cos(theta);
    const c = nx * P.x + nz * P.z;
    return { a: nx, b: nz, c };
  };
  let hpMin = lineFromPoint(thetaMin);
  let hpMax = lineFromPoint(thetaMax);

  // Test a point at the mid-angle to decide which side to keep.
  const midAngle = (thetaMin + thetaMax) / 2;
  const testDist = 100000;
  const testPoint: Point = { x: P.x + testDist * Math.cos(midAngle), z: P.z + testDist * Math.sin(midAngle) };

  // For hpMin, if testPoint is outside, flip the half-plane.
  if (signedDistance(testPoint, hpMin) > 0) {
    hpMin = { a: -hpMin.a, b: -hpMin.b, c: -hpMin.c };
  }
  if (signedDistance(testPoint, hpMax) > 0) {
    hpMax = { a: -hpMax.a, b: -hpMax.b, c: -hpMax.c };
  }
  return [hpMin, hpMax];
}

/**
 * Given an array of observations, build the error region polygon.
 */
export function buildErrorRegion(observations: Observation[]): Point[] {
  let hpList: HalfPlane[] = [];
  for (const obs of observations) {
    const wedgeHP = getWedgeHalfPlanes(obs);
    hpList = hpList.concat(wedgeHP);
  }
  return intersectHalfPlanes(hpList);
}
