export interface Observation {
  // The player’s absolute position (in blocks)
  playerX: number;
  playerZ: number;
  // The reported relative block coordinate.
  // (The true computed coordinate before flooring lies somewhere in
  //  [relX, relX+1)×[relZ, relZ+1).)
  relX: number;
  relZ: number;
}

export interface Point {
  x: number;
  z: number;
}

interface Ray {
  origin: Point;
  // Unit direction vector computed from the reported coordinate.
  d: Point;
}

/**
 * Normalize a 2D vector.
 */
function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.z);
  return { x: v.x / len, z: v.z / len };
}

/**
 * Given a set of rays (each defined by an origin and a unit direction),
 * compute the point that minimizes the sum of squared distances to each ray.
 *
 * This is done by solving the normal equations:
 *
 *    A * E = b,   where:
 *
 *      A = Σ (I – dᵢdᵢᵀ)
 *      b = Σ (I – dᵢdᵢᵀ)*originᵢ
 */
function computeLeastSquaresIntersection(rays: Ray[]): Point {
  let A00 = 0,
    A01 = 0,
    A10 = 0,
    A11 = 0;
  let b0 = 0,
    b1 = 0;
  for (const ray of rays) {
    const d = ray.d;
    // The projection matrix is: I - d dᵀ
    const m00 = 1 - d.x * d.x;
    const m01 = -d.x * d.z;
    const m10 = -d.x * d.z;
    const m11 = 1 - d.z * d.z;
    A00 += m00;
    A01 += m01;
    A10 += m10;
    A11 += m11;
    b0 += m00 * ray.origin.x + m01 * ray.origin.z;
    b1 += m10 * ray.origin.x + m11 * ray.origin.z;
  }
  const det = A00 * A11 - A01 * A10;
  if (Math.abs(det) < 1e-8) {
    // If the system is ill-conditioned, fallback to averaging origins.
    let sumX = 0,
      sumZ = 0;
    for (const ray of rays) {
      sumX += ray.origin.x;
      sumZ += ray.origin.z;
    }
    return { x: sumX / rays.length, z: sumZ / rays.length };
  }
  const ex = (A11 * b0 - A01 * b1) / det;
  const ez = (-A10 * b0 + A00 * b1) / det;
  return { x: ex, z: ez };
}

/**
 * Euclidean distance between two points.
 */
function distance(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.z - p2.z);
}

/**
 * Triangulate the event location given a set of observations.
 *
 * For each observation, we assume the true computed coordinate (before flooring)
 * lies in the square [relX, relX+1)×[relZ, relZ+1). We use the center (rel+0.5)
 * as the nominal value and then sample the four corners to propagate uncertainty.
 *
 * Returns an estimated event coordinate and a worst-case error radius.
 */
export function triangulateEvent(observations: Observation[]): { estimatedX: number; estimatedZ: number; errorRadius: number } | null {
  if (observations.length === 0) return null;

  // Compute nominal rays using the center of each 1×1 uncertainty square.
  const nominalRays: Ray[] = observations.map((obs) => {
    const origin = { x: obs.playerX, z: obs.playerZ };
    const reportedCenter = { x: obs.relX + 0.5, z: obs.relZ + 0.5 };
    const dirVec = { x: reportedCenter.x - origin.x, z: reportedCenter.z - origin.z };
    const d = normalize(dirVec);
    return { origin, d };
  });
  const nominalE = computeLeastSquaresIntersection(nominalRays);

  // Now sample the extremes by considering each observation’s 4 corners.
  // For n observations there are 4ⁿ combinations.
  const extremePoints: Point[] = [];
  const n = observations.length;
  const totalComb = Math.pow(4, n);
  for (let i = 0; i < totalComb; i++) {
    let combo = i;
    const rays: Ray[] = [];
    for (let j = 0; j < n; j++) {
      const obs = observations[j];
      // Determine which corner for observation j:
      // 0 -> (relX, relZ)
      // 1 -> (relX+1, relZ)
      // 2 -> (relX, relZ+1)
      // 3 -> (relX+1, relZ+1)
      const cornerIndex = combo % 4;
      combo = Math.floor(combo / 4);
      let corner: Point;
      if (cornerIndex === 0) {
        corner = { x: obs.relX, z: obs.relZ };
      } else if (cornerIndex === 1) {
        corner = { x: obs.relX + 1, z: obs.relZ };
      } else if (cornerIndex === 2) {
        corner = { x: obs.relX, z: obs.relZ + 1 };
      } else {
        // cornerIndex === 3
        corner = { x: obs.relX + 1, z: obs.relZ + 1 };
      }
      const origin = { x: obs.playerX, z: obs.playerZ };
      // Here we use the corner directly (i.e. the extreme value) rather than the center.
      const d = normalize({ x: corner.x - origin.x, z: corner.z - origin.z });
      rays.push({ origin, d });
    }
    const E = computeLeastSquaresIntersection(rays);
    extremePoints.push(E);
  }

  // The worst-case error radius is the maximum distance from nominalE to any extreme solution.
  let errorRadius = 0;
  for (const E of extremePoints) {
    const d = distance(nominalE, E);
    if (d > errorRadius) errorRadius = d;
  }

  return { estimatedX: nominalE.x, estimatedZ: nominalE.z, errorRadius };
}



/**
 * Computes the intersection of two lines given in point-angle form.
 * Each line is defined as: P + t*(cos(theta), sin(theta)).
 * Returns null if the lines are nearly parallel.
 */
function intersectLines(P1: Point, theta1: number, P2: Point, theta2: number): Point | null {
  const d1 = { x: Math.cos(theta1), z: Math.sin(theta1) };
  const d2 = { x: Math.cos(theta2), z: Math.sin(theta2) };
  const denom = d1.x * d2.z - d1.z * d2.x;
  if (Math.abs(denom) < 1e-8) return null;
  const diff = { x: P2.x - P1.x, z: P2.z - P1.z };
  const t = (diff.x * d2.z - diff.z * d2.x) / denom;
  return { x: P1.x + t * d1.x, z: P1.z + t * d1.z };
}



/**
 * Triangulate the event location given a set of observations.
 *
 * For each observation, we assume the true computed coordinate (before flooring)
 * lies in the square [relX, relX+1)×[relZ, relZ+1). We use the center (rel+0.5)
 * as the nominal value.
 *
 * To estimate the worst-case error without enumerating all 4^n combinations, we:
 * 1. Compute two extreme angles (thetaMin and thetaMax) for each observation based
 *    on the four corners of its uncertainty square.
 * 2. Create an extreme ray for each of these angles.
 * 3. Compute pairwise intersections between extreme rays from different observations.
 * 4. Use the maximum distance between the nominal intersection and any of these
 *    intersections as the worst-case error.
 */
export function triangulateEvent1(observations: Observation[]): { estimatedX: number; estimatedZ: number; errorRadius: number } | null {
  if (observations.length === 0) return null;

  // Compute nominal rays using the center of each uncertainty square.
  const nominalRays: Ray[] = observations.map(obs => {
    const origin: Point = { x: obs.playerX, z: obs.playerZ };
    const center: Point = { x: obs.relX + 0.5, z: obs.relZ + 0.5 };
    const d = normalize({ x: center.x - origin.x, z: center.z - origin.z });
    return { origin, d };
  });
  const nominalE = computeLeastSquaresIntersection(nominalRays);

  // For each observation, compute the minimum and maximum possible angles.
  interface ExtendedObservation {
    origin: Point;
    thetaMin: number;
    thetaMax: number;
  }
  const extendedObs: ExtendedObservation[] = observations.map(obs => {
    const origin: Point = { x: obs.playerX, z: obs.playerZ };
    // Four corners of the uncertainty square.
    const corners: Point[] = [
      { x: obs.relX,     z: obs.relZ },
      { x: obs.relX + 1, z: obs.relZ },
      { x: obs.relX,     z: obs.relZ + 1 },
      { x: obs.relX + 1, z: obs.relZ + 1 }
    ];
    // Compute the angle for each corner relative to the origin.
    const angles = corners.map(corner => Math.atan2(corner.z - origin.z, corner.x - origin.x));
    // For simplicity, assume angles don't wrap around 2π.
    const thetaMin = Math.min(...angles);
    const thetaMax = Math.max(...angles);
    return { origin, thetaMin, thetaMax };
  });

  // Create extreme rays: one for thetaMin and one for thetaMax per observation.
  interface ExtremeRay {
    origin: Point;
    theta: number;
    obsIndex: number;
  }
  const extremeRays: ExtremeRay[] = [];
  for (let i = 0; i < extendedObs.length; i++) {
    extremeRays.push({ origin: extendedObs[i].origin, theta: extendedObs[i].thetaMin, obsIndex: i });
    extremeRays.push({ origin: extendedObs[i].origin, theta: extendedObs[i].thetaMax, obsIndex: i });
  }

  // Compute pairwise intersections for rays from different observations.
  const extremePoints: Point[] = [];
  for (let i = 0; i < extremeRays.length; i++) {
    for (let j = i + 1; j < extremeRays.length; j++) {
      // Only consider rays from different observations.
      if (extremeRays[i].obsIndex === extremeRays[j].obsIndex) continue;
      const inter = intersectLines(
        extremeRays[i].origin, extremeRays[i].theta,
        extremeRays[j].origin, extremeRays[j].theta
      );
      if (inter !== null) {
        extremePoints.push(inter);
      }
    }
  }

  // Determine the worst-case error radius as the maximum distance from nominalE.
  let errorRadius = 0;
  for (const pt of extremePoints) {
    const d = distance(nominalE, pt);
    if (d > errorRadius) errorRadius = d;
  }

  return { estimatedX: nominalE.x, estimatedZ: nominalE.z, errorRadius };
}


/**
 * Compute the nominal intersection point using the center of each uncertainty square.
 */
function computeNominalIntersection(observations: Observation[]): Point {
  const rays: Ray[] = observations.map(obs => {
    const origin: Point = { x: obs.playerX, z: obs.playerZ };
    const center: Point = { x: obs.relX + 0.5, z: obs.relZ + 0.5 };
    const d = normalize({ x: center.x - origin.x, z: center.z - origin.z });
    return { origin, d };
  });
  return computeLeastSquaresIntersection(rays);
}

/**
 * Given a set of observations and a set of offsets (one per observation),
 * compute the intersection point. For each observation, the true computed coordinate is assumed to be
 * (obs.relX + deltaX, obs.relZ + deltaZ), where deltaX and deltaZ are in [0,1).
 */
function computeIntersectionForSample(
  observations: Observation[],
  offsets: { deltaX: number; deltaZ: number }[]
): Point {
  const rays: Ray[] = observations.map((obs, i) => {
    const origin: Point = { x: obs.playerX, z: obs.playerZ };
    const samplePoint: Point = { x: obs.relX + offsets[i].deltaX, z: obs.relZ + offsets[i].deltaZ };
    const d = normalize({ x: samplePoint.x - origin.x, z: samplePoint.z - origin.z });
    return { origin, d };
  });
  return computeLeastSquaresIntersection(rays);
}

/**
 * Approximates the worst-case error using Monte Carlo sampling.
 *
 * Instead of enumerating all 4^n combinations, we sample a number of combinations.
 *
 * @param observations The array of observations.
 * @param samples Number of Monte Carlo samples.
 * @returns The approximated worst-case error bound (in blocks).
 */
export function monteCarloWorstCaseError(observations: Observation[], samples: number): number {
  const nominal = computeNominalIntersection(observations);
  let worstError = 0;
  for (let s = 0; s < samples; s++) {
    const offsets = observations.map(() => ({
      deltaX: Math.random(), // Uniformly in [0,1)
      deltaZ: Math.random()
    }));
    const sampleIntersection = computeIntersectionForSample(observations, offsets);
    const error = distance(nominal, sampleIntersection);
    if (error > worstError) worstError = error;
  }
  return worstError;
}

/**
 * A new version of triangulateEvent that returns the nominal intersection as before,
 * but uses Monte Carlo sampling to approximate a tight worst-case error estimate.
 */
export function triangulateEvent2(observations: Observation[], monteCarloSamples = 10000): { estimatedX: number; estimatedZ: number; errorRadius: number } | null {
  if (observations.length === 0) return null;
  const nominal = computeNominalIntersection(observations);
  // Approximate worst-case error using Monte Carlo sampling.
  const errorRadius = monteCarloWorstCaseError(observations, monteCarloSamples);
  return { estimatedX: nominal.x, estimatedZ: nominal.z, errorRadius };
}


/**
 * Uses finite differences to approximate the worst-case error via linear error propagation.
 *
 * For each observation, we compute the partial derivatives of the event coordinate (x and z)
 * with respect to relX and relZ. We then assume the maximum deviation in each coordinate is 0.5,
 * and sum (in the worst-case, where errors align adversarially) the contributions.
 *
 * Returns an estimated worst-case error radius in blocks.
 */
function linearWorstCaseError(observations: Observation[]): number {
  const delta = 1e-3; // small perturbation for finite differences
  const nominal = computeNominalIntersection(observations);

  // These accumulators represent the worst-case contributions to the estimated event coordinate
  let totalErrorX = 0;
  let totalErrorZ = 0;

  // For each observation, compute the sensitivity (partial derivative) of the event coordinate.
  for (let i = 0; i < observations.length; i++) {
    // Copy observations for perturbation.
    const obsPerturbX = observations.map(o => ({ ...o }));
    obsPerturbX[i].relX += delta;
    const perturbedX = computeNominalIntersection(obsPerturbX);

    const dEx_dRelX = (perturbedX.x - nominal.x) / delta;
    const dEz_dRelX = (perturbedX.z - nominal.z) / delta;

    const obsPerturbZ = observations.map(o => ({ ...o }));
    obsPerturbZ[i].relZ += delta;
    const perturbedZ = computeNominalIntersection(obsPerturbZ);

    const dEx_dRelZ = (perturbedZ.x - nominal.x) / delta;
    const dEz_dRelZ = (perturbedZ.z - nominal.z) / delta;

    // For worst-case, assume each observation's relX and relZ can be off by up to 0.5 (in absolute value).
    // Their contributions to the error in x and z are then:
    const errorX_i = Math.abs(dEx_dRelX) * 0.5 + Math.abs(dEx_dRelZ) * 0.5;
    const errorZ_i = Math.abs(dEz_dRelX) * 0.5 + Math.abs(dEz_dRelZ) * 0.5;

    totalErrorX += errorX_i;
    totalErrorZ += errorZ_i;
  }

  // In the worst-case, if all errors aligned, the overall error is the Euclidean norm of the sum.
  return Math.hypot(totalErrorX, totalErrorZ);
}

/**
 * Triangulate the event location given a set of observations.
 *
 * This function computes the nominal intersection point (using the centers of the uncertainty squares)
 * and then uses linear error propagation to estimate a worst-case error radius.
 *
 * The advantage is that no combinatorial explosion occurs, so the memory footprint is very low.
 */
export function triangulateEventLinear(observations: Observation[]): { estimatedX: number; estimatedZ: number; errorRadius: number } | null {
  if (observations.length === 0) return null;
  const nominal = computeNominalIntersection(observations);
  const errorRadius = linearWorstCaseError(observations);
  return { estimatedX: nominal.x, estimatedZ: nominal.z, errorRadius };
}


/**
 * Computes the intersection point for a given set of offsets.
 * For each observation, the true computed coordinate is assumed to be
 * (obs.relX + offset.dx, obs.relZ + offset.dz), where offset.dx and offset.dz are either 0 or 1.
 */
function computeIntersectionForOffsets(
  observations: Observation[],
  offsets: { dx: number; dz: number }[]
): Point {
  const rays: Ray[] = observations.map((obs, i) => {
    const origin: Point = { x: obs.playerX, z: obs.playerZ };
    // Use the provided offset for each observation.
    const samplePoint = { x: obs.relX + offsets[i].dx, z: obs.relZ + offsets[i].dz };
    const d = normalize({ x: samplePoint.x - origin.x, z: samplePoint.z - origin.z });
    return { origin, d };
  });
  return computeLeastSquaresIntersection(rays);
}
