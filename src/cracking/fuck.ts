import { generateGraph } from "../drawing/test";
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
   * Converts a point P and angle θ to a line in normal form: a*x + b*z = c,
   * with the line passing through P and oriented at angle θ from the x-axis.
   *
   * Normal vector n = (-sinθ, cosθ).  Then c = n·P.
   */
  function lineFromPointAngle(P: Point, theta: number): { a: number; b: number; c: number } {
    const nx = -Math.sin(theta);
    const nz =  Math.cos(theta);
    const c = nx * P.x + nz * P.z;
    return { a: nx, b: nz, c };
  }
  
  /**
   * Given an observation (which yields a 1×1 square for Q),
   * compute two half-planes that bound the feasible directions from the sensor.
   * The angles to the four corners define [θmin, θmax].
   * We'll produce lineMin and lineMax, each stored in half-plane form:
   *   a*x + b*z <= c
   *
   * We pick the correct side by testing a point at the middle angle.
   */
  function getWedgeHalfPlanes(obs: Observation): HalfPlane[] {
    const P: Point = { x: obs.playerX, z: obs.playerZ };
    const corners = [
      { x: obs.relX,     z: obs.relZ },
      { x: obs.relX + 1, z: obs.relZ },
      { x: obs.relX,     z: obs.relZ + 1 },
      { x: obs.relX + 1, z: obs.relZ + 1 },
    ];
    // Compute angles from P to each corner.
    const angles = corners.map(c => Math.atan2(c.z - P.z, c.x - P.x));
    const thetaMin = Math.min(...angles);
    const thetaMax = Math.max(...angles);
  
    // Build lines from P at thetaMin and thetaMax.
    const lineMin = lineFromPointAngle(P, thetaMin);
    const lineMax = lineFromPointAngle(P, thetaMax);
  
    // We'll pick which side of lineMin is inside by testing a "middle angle" point.
    const midAngle = (thetaMin + thetaMax) / 2;
    const testR = 100000; // some radius for the test point
    const testPoint: Point = {
      x: P.x + testR * Math.cos(midAngle),
      z: P.z + testR * Math.sin(midAngle),
    };
  
    // Evaluate lineMin: a*x + b*z - c
    const distMin = lineMin.a * testPoint.x + lineMin.b * testPoint.z - lineMin.c;
    // We want "inside" => a*x + b*z <= c if distMin <= 0
    // If distMin > 0, that means the feasible side is the opposite, so we multiply lineMin by -1
    let hpMin: HalfPlane = { a: lineMin.a, b: lineMin.b, c: lineMin.c };
    if (distMin > 0) {
      hpMin = { a: -lineMin.a, b: -lineMin.b, c: -lineMin.c };
    }
  
    // Similarly for lineMax
    const distMax = lineMax.a * testPoint.x + lineMax.b * testPoint.z - lineMax.c;
    let hpMax: HalfPlane = { a: lineMax.a, b: lineMax.b, c: lineMax.c };
    if (distMax > 0) {
      hpMax = { a: -lineMax.a, b: -lineMax.b, c: -lineMax.c };
    }
  
    return [hpMin, hpMax];
  }
  
  /**
   * Returns the signed distance from point p to the line for halfPlane hp.
   * If value <= 0 => p is inside (feasible side).
   * If value > 0 => p is outside.
   */
  function signedDistance(p: Point, hp: HalfPlane): number {
    return hp.a * p.x + hp.b * p.z - hp.c;
  }
  
  /**
   * Computes the intersection point between two lines:
   *   L1: a1*x + b1*z = c1
   *   L2: a2*x + b2*z = c2
   * Returns null if parallel.
   */
  function intersectLines(hp1: HalfPlane, hp2: HalfPlane): Point | null {
    const { a: a1, b: b1, c: c1 } = hp1;
    const { a: a2, b: b2, c: c2 } = hp2;
    const denom = a1 * b2 - b1 * a2;
    if (Math.abs(denom) < 1e-12) {
      return null; // parallel or nearly so
    }
    const x = (c1 * b2 - b1 * c2) / denom;
    const z = (a1 * c2 - c1 * a2) / denom;
    return { x, z };
  }
  
  /**
   * Clips a polygon (array of points in CCW or CW order) against one half-plane hp:
   *   hp: a*x + b*z <= c
   * Returns the new polygon on that feasible side. If it becomes empty, returns [].
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
  
      const currInside = (currDist <= 0);
      const nextInside = (nextDist <= 0);
  
      if (currInside) {
        clipped.push(curr);
      }
      // If the edge crosses the line => compute intersection
      if (currInside !== nextInside) {
        const dx = next.x - curr.x;
        const dz = next.z - curr.z;
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
   * Intersects a list of half-planes. We start with a large bounding polygon
   * (like a huge square) and clip it against each half-plane in turn.
   */
  function intersectHalfPlanes(halfPlanes: HalfPlane[]): Point[] {
    // Start with a large bounding polygon in CCW order:
    let polygon: Point[] = [
      { x: -1e9, z: -1e9 },
      { x:  1e9, z: -1e9 },
      { x:  1e9, z:  1e9 },
      { x: -1e9, z:  1e9 },
    ];
  
    for (const hp of halfPlanes) {
      polygon = clipPolygonAgainstHalfPlane(polygon, hp);
      if (polygon.length === 0) break;
    }
    return polygon;
  }
  
  /**
   * Builds the feasible polygon by intersecting all wedge half-planes from each observation.
   */
  export function buildErrorRegion(observations: Observation[]): Point[] {
    let halfPlanes: HalfPlane[] = [];
    for (const obs of observations) {
      const wedgeHP = getWedgeHalfPlanes(obs);
      halfPlanes = halfPlanes.concat(wedgeHP);
    }
    return intersectHalfPlanes(halfPlanes);
  }
  
  const minRadius = 100;
  const maxRadius = 10000;
  
  const minBotRadius = 500;
  const maxBotRadius = 5000;
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
  console.log(feasiblePolygon.map(obj => `(${obj.x}, ${obj.z})`))
  
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
    generateGraph(observations, obj, "test1.png");
  }
  