import { generateGraph } from "../drawing/draw";
import { generateExplosionLocation } from "./build_test_utils";
import { generateGridObservationsForN } from "./generators";
import { triangulateEventLinear } from "./triangulation";

interface Observation {
  playerX: number;
  playerZ: number;
  relX: number;
  relZ: number;
}

interface Point {
  x: number;
  z: number;
}

// A line/half-plane can be stored as: a*x + b*z <= c.
interface HalfPlane {
  a: number;
  b: number;
  c: number;
}

/**
 * Convert a point P and angle theta to a line in normal form: a*x + b*z = c
 * such that the line passes through P and has angle theta from the x-axis.
 */
function lineFromPointAngle(P: Point, theta: number): { a: number; b: number; c: number } {
  // The direction vector is (cosθ, sinθ).
  // A normal to that direction is n = (-sinθ, cosθ).
  const nx = -Math.sin(theta);
  const nz = Math.cos(theta);
  // The line passes through P, so c = n•P.
  const c = nx * P.x + nz * P.z;
  return { a: nx, b: nz, c };
}

/**
 * For each observation, compute thetaMin and thetaMax from the 4 corners
 * (obs.relX, obs.relZ), (obs.relX+1, obs.relZ), ...
 */
function getWedgeHalfPlanes(obs: Observation): HalfPlane[] {
  const P = { x: obs.playerX, z: obs.playerZ };
  const corners = [
    { x: obs.relX, z: obs.relZ },
    { x: obs.relX + 1, z: obs.relZ },
    { x: obs.relX, z: obs.relZ + 1 },
    { x: obs.relX + 1, z: obs.relZ + 1 },
  ];
  const angles = corners.map((c) => Math.atan2(c.z - P.z, c.x - P.x));
  let thetaMin = Math.min(...angles);
  let thetaMax = Math.max(...angles);
  const lineMin = lineFromPointAngle(P, thetaMin);
  const lineMax = lineFromPointAngle(P, thetaMax);

  // For a line a*x + b*z = c, the half-plane depends on which side we keep.
  // We want E to be "to the inside" of lineMin and lineMax in angle terms.
  // We'll do a sign check with a reference point.
  // For brevity, let's guess we keep a*x + b*z >= c for lineMin, and <= c for lineMax.
  // (We might do a small angle check to ensure we keep the correct side.)
  // For a robust solution, you'd carefully pick the sign.

  // Example:
  // We'll define a half-plane as (a, b, c, sense), sense in {+1, -1} meaning
  // a*x + b*z >= c or <= c.
  // We'll just store them as standard forms: a*x + b*z <= c, or a*x + b*z >= c
  // Then do half-plane intersection.

  // We'll do a quick check to see which side is correct by plugging in the "middle angle" point.
  // For simplicity, let's assume a small approach:

  return [
    // lineMin: keep the half-plane that is "inside" the wedge
    { a: lineMin.a, b: lineMin.b, c: lineMin.c }, // we'd store sense too
    // lineMax: ...
  ];
}

/**
 * Main function to build the shape.
 */
function buildErrorRegion(observations: Observation[]): Point[] {
  // Start with an unbounded polygon (or half-plane set).
  let halfPlanes: HalfPlane[] = [];
  for (const obs of observations) {
    // get wedge constraints
    const wedgeHP = getWedgeHalfPlanes(obs);
    // add them to the global half-plane list
    halfPlanes = halfPlanes.concat(wedgeHP);
  }
  // Now do half-plane intersection:
  // Suppose we have a function intersectHalfPlanes(halfPlanes) that returns
  // the polygon (array of points) representing the intersection.
  const feasiblePolygon = intersectHalfPlanes(halfPlanes);
  return feasiblePolygon;
}

interface Point {
  x: number;
  z: number;
}

/**
 * A half-plane is defined by the line a*x + b*z = c,
 * with the feasible region being a*x + b*z <= c.
 */
interface HalfPlane {
  a: number;
  b: number;
  c: number;
}

/**
 * Returns the signed distance from point p to the line for halfPlane hp.
 * If the value is <= 0, p is inside (on the feasible side).
 * If the value is > 0, p is outside.
 */
function signedDistance(p: Point, hp: HalfPlane): number {
  return hp.a * p.x + hp.b * p.z - hp.c;
}

/**
 * Computes the intersection point between two lines (defined by two half-planes):
 *    L1: a1*x + b1*z = c1
 *    L2: a2*x + b2*z = c2
 * Returns null if the lines are parallel (or nearly so).
 */
function intersectLines(hp1: HalfPlane, hp2: HalfPlane): Point | null {
  const { a: a1, b: b1, c: c1 } = hp1;
  const { a: a2, b: b2, c: c2 } = hp2;
  const denom = a1 * b2 - b1 * a2;
  if (Math.abs(denom) < 1e-12) {
    return null; // lines are parallel
  }
  // Solve the 2x2 system:
  //   a1*x + b1*z = c1
  //   a2*x + b2*z = c2
  // We can do:
  //   x = (c1*b2 - b1*c2) / denom
  //   z = (a1*c2 - c1*a2) / denom
  const x = (c1 * b2 - b1 * c2) / denom;
  const z = (a1 * c2 - c1 * a2) / denom;
  return { x, z };
}

/**
 * Clips a polygon (array of points in CCW or CW order) against one half-plane hp.
 * Returns the new polygon on the feasible side (a*x + b*z <= c).
 * If the polygon becomes empty, returns [].
 */
function clipPolygonAgainstHalfPlane(polygon: Point[], hp: HalfPlane): Point[] {
  const n = polygon.length;
  if (n === 0) return [];
  const clipped: Point[] = [];

  for (let i = 0; i < n; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    const currDist = signedDistance(curr, hp);
    const nextDist = signedDistance(next, hp);

    const currInside = currDist <= 0;
    const nextInside = nextDist <= 0;

    if (currInside) {
      // Current vertex is inside; keep it
      clipped.push(curr);
    }
    // Check for edge intersection
    if (currInside !== nextInside) {
      // The edge crosses the line => compute intersection
      // Parametric form: we have an edge from curr to next
      // We want to find alpha in [0,1] s.t. point = curr + alpha*(next-curr)
      const dx = next.x - curr.x;
      const dz = next.z - curr.z;
      // We'll do a small solve. We know at intersection, hp.a*(curr.x + alpha*dx) + hp.b*(curr.z + alpha*dz) = hp.c
      // => alpha = ...
      const denom = hp.a * dx + hp.b * dz;
      if (Math.abs(denom) > 1e-12) {
        const alpha = (hp.c - (hp.a * curr.x + hp.b * curr.z)) / denom;
        if (alpha >= 0 && alpha <= 1) {
          const ix = curr.x + alpha * dx;
          const iz = curr.z + alpha * dz;
          clipped.push({ x: ix, z: iz });
        }
      }
    }
  }

  return clipped;
}

/**
 * Intersects a set of half-planes (hpList). We start with a large bounding polygon
 * that covers all feasible coordinates (like a big square). Then we clip it against
 * each half-plane in turn.
 *
 * If the polygon becomes empty, there's no feasible region.
 */
export function intersectHalfPlanes(hpList: HalfPlane[]): Point[] {
  // Start with a large bounding polygon. For instance, a big square from -1e9..+1e9.
  // We'll store it in CCW order:
  let polygon: Point[] = [
    { x: -1e9, z: -1e9 },
    { x: 1e9, z: -1e9 },
    { x: 1e9, z: 1e9 },
    { x: -1e9, z: 1e9 },
  ];

  for (const hp of hpList) {
    polygon = clipPolygonAgainstHalfPlane(polygon, hp);
    if (polygon.length === 0) break; // no feasible region
  }

  return polygon;
}

const minRadius = 10;
const maxRadius = 100;

const minBotRadius = 5;
const maxBotRadius = 10;
const actual = generateExplosionLocation(minRadius, maxRadius);
const observations: Observation[] = generateGridObservationsForN(4, maxBotRadius, actual.x, actual.z, 160);

console.log(actual);
console.log(observations);

const hpList: HalfPlane[] = [];
for (const obs of observations) {
  // Add the half-planes for the wedge from obs
  // hpList.push(...theTwoHalfPlanes);
  hpList.push(...getWedgeHalfPlanes(obs));
}
const feasiblePolygon = intersectHalfPlanes(hpList);
console.log("Feasible region vertices:", feasiblePolygon);

const out = triangulateEventLinear(observations);
console.log(out)
if (out == null) {
  console.log("Triangulation failed.");
} else {
  const offsets = [];
  for (let i = 0; i < observations.length; i++) {
    offsets.push({ dx: 0.5, dz: 0.5 });
  }
  const obj = { ...out, offsets: offsets, actualX: actual.x, actualZ: actual.z};
  generateGraph(observations, obj, "test.png");
}
