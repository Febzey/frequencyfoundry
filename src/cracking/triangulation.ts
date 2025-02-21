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
 * Computes the error radius for a set of observations.
 */
function comprehensiveErrorRadius(observations: Observation[], nominalE: Point): number {
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
    return errorRadius;
}


/**
 * Given an observation, returns two candidate offsets:
 *   - default: (0,0) which corresponds to Q = (relX, relZ)
 *   - extreme: the candidate (from the four corners) that has the largest angular difference
 *     from the default.
 */
function getCandidateOffsetsForObservation(obs: Observation): { min: { dx: number; dz: number }, max: { dx: number; dz: number } } {
  const defaultOffset = { dx: 0, dz: 0 };
  const P = { x: obs.playerX, z: obs.playerZ };

  // The four candidate offsets:
  const candidates = [
    { dx: 0, dz: 0 }, // no need to check this.
    { dx: 1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 1, dz: 1 }
  ];

  // Function to compute the angle (in radians) from sensor P to Q.
  function angleForOffset(offset: { dx: number; dz: number }): number {
    const Q = { x: obs.relX + offset.dx, z: obs.relZ + offset.dz };
    return Math.atan2(Q.z - P.z, Q.x - P.x);
  }

  const defaultAngle = angleForOffset(defaultOffset);
  let maxDiff = -1;
  let extremeCandidate = defaultOffset;
  for (const cand of candidates) {
    const a = angleForOffset(cand);
    // Compute absolute angular difference, normalized to [0, π]
    let diff = a - defaultAngle;
    diff = Math.abs(((diff + Math.PI) % (2 * Math.PI)) - Math.PI);
    if (diff > maxDiff) {
      maxDiff = diff;
      extremeCandidate = cand;
    }
  }
  return { min: defaultOffset, max: extremeCandidate };
}

/**
 * Optimized error radius computation.
 * Instead of enumerating all 4^n combinations, for each observation we only consider two candidates:
 * the default (nominal) and the one with the largest angular deviation.
 * We then enumerate over the 2^n combinations, compute the corresponding intersection for each, and
 * define errorRadius as the maximum Euclidean distance from the nominal intersection (using default
 * for every observation) to any candidate intersection.
 */
function optimizedComprehensiveErrorRadius(observations: Observation[], nominalE: Point): number {
  const n = observations.length;
  // Compute the nominal intersection using default offsets.
  let maxError = 0;

  // Enumerate over 2^n combinations:
  function rec(i: number, offsets: { dx: number; dz: number }[]) {
    if (i === n) {
      const E = computeIntersectionForOffsets(observations, offsets);
      const d = distance(nominalE, E);
      if (d > maxError) maxError = d;
      return;
    }
    const candidates = getCandidateOffsetsForObservation(observations[i]);
    // Choose default candidate:
    rec(i + 1, offsets.concat(candidates.min));
    // Choose extreme candidate:
    rec(i + 1, offsets.concat(candidates.max));
  }
  rec(0, []);
  return maxError;
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

  const nominalE1 = computeNominalIntersection(observations);
  const errorRadius = comprehensiveErrorRadius(observations, nominalE1);
  // const errorRadius = optimizedComprehensiveErrorRadius(observations, nominalE1);

  return { estimatedX: nominalE1.x, estimatedZ: nominalE1.z, errorRadius };
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
function linearWorstCaseError(observations: Observation[], nominalE: Point): number {
  const delta = 1e-3; // small perturbation for finite differences

  // These accumulators represent the worst-case contributions to the estimated event coordinate
  let totalErrorX = 0;
  let totalErrorZ = 0;

  // For each observation, compute the sensitivity (partial derivative) of the event coordinate.
  for (let i = 0; i < observations.length; i++) {
    // Copy observations for perturbation.
    const obsPerturbX = observations.map(o => ({ ...o }));
    obsPerturbX[i].relX += delta;
    const perturbedX = computeNominalIntersection(obsPerturbX);

    const dEx_dRelX = (perturbedX.x - nominalE.x) / delta;
    const dEz_dRelX = (perturbedX.z - nominalE.z) / delta;

    const obsPerturbZ = observations.map(o => ({ ...o }));
    obsPerturbZ[i].relZ += delta;
    const perturbedZ = computeNominalIntersection(obsPerturbZ);

    const dEx_dRelZ = (perturbedZ.x - nominalE.x) / delta;
    const dEz_dRelZ = (perturbedZ.z - nominalE.z) / delta;

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
  const errorRadius = linearWorstCaseError(observations, nominal);
  return { estimatedX: nominal.x, estimatedZ: nominal.z, errorRadius };
}



/**
 * Given parameters (E.x, E.z, f_0, g_0, ..., f_{n-1}, g_{n-1}),
 * computes the cost:
 *
 * For observation i (with position P_i and reported relative coordinate (relX_i, relZ_i)),
 * let:
 *   Q_i = (relX_i + f_i, relZ_i + g_i)
 * and
 *   u_i = (Q_i - P_i)/||Q_i - P_i||
 *   v_i = (E - P_i)/||E - P_i||
 *
 * Then cost = sum_i || u_i - v_i ||^2.
 */
function costFunction(
  observations: Observation[],
  params: number[]
): number {
  const n = observations.length;
  const E: Point = { x: params[0], z: params[1] };
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const obs = observations[i];
    const f = params[2 + 2 * i];
    const g = params[2 + 2 * i + 1];
    const P: Point = { x: obs.playerX, z: obs.playerZ };
    const Q: Point = { x: obs.relX + f, z: obs.relZ + g };
    const vecQ = { x: Q.x - P.x, z: Q.z - P.z };
    const vecE = { x: E.x - P.x, z: E.z - P.z };
    const normQ = Math.hypot(vecQ.x, vecQ.z);
    const normE = Math.hypot(vecE.x, vecE.z);
    // If either vector is degenerate, skip (or add large penalty)
    if (normQ < 1e-8 || normE < 1e-8) {
      cost += 1e6;
      continue;
    }
    const u = { x: vecQ.x / normQ, z: vecQ.z / normQ };
    const v = { x: vecE.x / normE, z: vecE.z / normE };
    const diffX = u.x - v.x;
    const diffZ = u.z - v.z;
    cost += diffX * diffX + diffZ * diffZ;
  }
  return cost;
}

/**
 * Computes a numerical gradient of costFunction with respect to params.
 */
function computeGradient(
  observations: Observation[],
  params: number[],
  delta: number = 1e-5
): number[] {
  const grad: number[] = [];
  const baseCost = costFunction(observations, params);
  for (let i = 0; i < params.length; i++) {
    const temp = params[i];
    params[i] = temp + delta;
    const costPlus = costFunction(observations, params);
    grad[i] = (costPlus - baseCost) / delta;
    params[i] = temp; // restore
  }
  return grad;
}

/**
 * Performs a simple gradient descent to minimize the cost function.
 * We project the fractional parameters into [0,1].
 */
function optimizeTriangulation(
  observations: Observation[],
  numIters: number = 1000,
  lr: number = 1e-3
): number[] {
  const n = observations.length;
  // params: [E.x, E.z, f0, g0, f1, g1, ..., f_{n-1}, g_{n-1}]
  // Initialize E as the nominal intersection (using (0.5,0.5) for fractions)
  let initialFractions = new Array(2 * n).fill(0.5);
  // For a rough initial E, we use the nominal intersection from our earlier method.
  const nominalRays = observations.map(obs => {
    const origin = { x: obs.playerX, z: obs.playerZ };
    const center = { x: Math.floor(obs.relX) + 0.5, z: Math.floor(obs.relZ) + 0.5 };
    const d = normalize({ x: center.x - origin.x, z: center.z - origin.z });
    return { origin, d };
  });
  const initialE = computeLeastSquaresIntersection(nominalRays);
  let params: number[] = [initialE.x, initialE.z, ...initialFractions];

  for (let iter = 0; iter < numIters; iter++) {
    const grad = computeGradient(observations, params);
    for (let i = 0; i < params.length; i++) {
      params[i] -= lr * grad[i];
    }
    // Project the fractional parts into [0,1]
    for (let i = 2; i < params.length; i++) {
      if (params[i] < 0) params[i] = 0;
      if (params[i] > 1) params[i] = 1;
    }
    // Optionally, you can decrease the learning rate or check convergence.
  }
  return params;
}

/**
 * New triangulation function that uses optimization to recover fractional offsets.
 * It returns a refined estimate of the event location E and also (optionally) the recovered fractions.
 *
 * @param observations - Array of observations.
 * @param numIters - Number of iterations for gradient descent.
 * @param lr - Learning rate.
 * @returns Object containing estimatedX, estimatedZ, and optionally fractions.
 */
export function triangulateEventOptimized(
  observations: Observation[],
  numIters: number = 1000,
  lr: number = 1e-3
): { estimatedX: number; estimatedZ: number; fractions: { f: number; g: number }[], errorRadius: number } | null {
  if (observations.length === 0) return null;
  const optimizedParams = optimizeTriangulation(observations, numIters, lr);
  const E = { x: optimizedParams[0], z: optimizedParams[1] };
  const fractions: { f: number; g: number }[] = [];
  for (let i = 0; i < observations.length; i++) {
    const f = optimizedParams[2 + 2 * i];
    const g = optimizedParams[2 + 2 * i + 1];
    fractions.push({ f, g });
  }
  return { estimatedX: E.x, estimatedZ: E.z, fractions, errorRadius: 0 };
}

/**
 * Generates an array of evenly spaced numbers between 0 and 1, inclusive.
 * @param steps - The number of divisions within [0,1] (e.g., 8 results in 9 values).
 * @returns An array of numbers from 0 to 1 in increments of 1/steps.
 */
export function generateCandidateFractions(steps: number): number[] {
  const fractions: number[] = [];
  for (let i = 0; i <= steps; i++) {
    fractions.push(i / steps);
  }
  return fractions;
}


/**
 * Computes a cost for a given set of offsets.
 * For each observation i:
 *   Q_i = (obs.relX + offset.dx, obs.relZ + offset.dz)
 * Let u_i = (Q_i - P_i)/||Q_i - P_i|| and v_i = (E - P_i)/||E - P_i||,
 * where E is the intersection computed with these offsets.
 * The cost is the sum over observations of ||u_i - v_i||^2.
 * Lower cost indicates better consistency.
 */
function computeCost(
  observations: Observation[],
  offsets: { dx: number; dz: number }[]
): number {
  const E = computeIntersectionForOffsets(observations, offsets);
  let cost = 0;
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const P: Point = { x: obs.playerX, z: obs.playerZ };
    const Q: Point = { x: obs.relX + offsets[i].dx, z: obs.relZ + offsets[i].dz };
    const vecQ = { x: Q.x - P.x, z: Q.z - P.z };
    const normQ = Math.hypot(vecQ.x, vecQ.z);
    const u = { x: vecQ.x / normQ, z: vecQ.z / normQ };

    const vecE = { x: E.x - P.x, z: E.z - P.z };
    const normE = Math.hypot(vecE.x, vecE.z);
    const v = { x: vecE.x / normE, z: vecE.z / normE };

    cost += Math.pow(u.x - v.x, 2) + Math.pow(u.z - v.z, 2);
  }
  return cost;
}

/**
 * Computes the orthogonal distance from point E to a ray defined by (origin, d).
 */
function distancePointToRay(E: Point, ray: Ray): number {
  const { origin: P, d } = ray;
  const EP = { x: E.x - P.x, z: E.z - P.z };
  const t = EP.x * d.x + EP.z * d.z;
  const proj = { x: P.x + t * d.x, z: P.z + t * d.z };
  return Math.hypot(E.x - proj.x, E.z - proj.z);
}

/**
 * Computes the total residual cost for a given set of offsets.
 * For each observation i, it computes the distance from the computed intersection E
 * to the ray defined by the sensor and its adjusted computed coordinate.
 * The cost is the sum of these distances.
 */
function computeResidualCost(
  observations: Observation[],
  offsets: { dx: number; dz: number }[]
): number {
  const E = computeIntersectionForOffsets(observations, offsets);
  let totalResidual = 0;
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const P: Point = { x: obs.playerX, z: obs.playerZ };
    const samplePoint: Point = { x: obs.relX + offsets[i].dx, z: obs.relZ + offsets[i].dz };
    const d = normalize({ x: samplePoint.x - P.x, z: samplePoint.z - P.z });
    const ray: Ray = { origin: P, d };
    totalResidual += distancePointToRay(E, ray);
  }
  return totalResidual;
}
/**
 * Helper: Given a partial assignment of offsets (an array of length i),
 * complete it by filling unassigned offsets with nominal values (0.5).
 */
function completeOffsets(
  offsetsPartial: number[],
  n: number
): { dx: number; dz: number }[] {
  const completed: { dx: number; dz: number }[] = [];
  for (let j = 0; j < n; j++) {
    if (2 * j + 1 < offsetsPartial.length) {
      completed.push({ dx: offsetsPartial[2 * j], dz: offsetsPartial[2 * j + 1] });
    } else {
      completed.push({ dx: 0.5, dz: 0.5 });
    }
  }
  return completed;
}

/**
 * Recursively searches over candidate offsets using the given candidateFractions.
 * For each observation, we have two parameters (dx and dz).
 * Returns the candidate combination (offsets) that minimizes the residual cost,
 * along with the computed intersection E.
 *
 * Uses a dynamic threshold: if the completed partial assignment’s cost is greater than
 * bestResidual * (1 + alpha), then prune.
 */
function searchCandidateOffsets(
  observations: Observation[],
  candidateFractions: number[],
  alpha: number = 0.1  // 10% tolerance
): { bestOffsets: { dx: number; dz: number }[]; bestResidual: number; bestE: Point } {
  const n = observations.length;
  // Start with nominal offsets.
  let bestOffsets: { dx: number; dz: number }[] = Array(n).fill(0).map(() => ({ dx: 0.5, dz: 0.5 }));
  let bestResidual = computeResidualCost(observations, bestOffsets);
  let bestE = computeIntersectionForOffsets(observations, bestOffsets);

  function rec(i: number, offsets: number[]) {
    // When we have a partial assignment, complete it with nominal values.
    // if (i % 2 === 0) {
    //   const completed = completeOffsets(offsets, n);
    //   const lowerBound = computeResidualCost(observations, completed);
    //   if (lowerBound > bestResidual * (1 + alpha)) {
    //     // Prune this branch.
    //     return;
    //   }
    // }
    if (i === 2 * n) {
      const offsetObjs = completeOffsets(offsets, n);
      const residual = computeResidualCost(observations, offsetObjs);
      if (residual < bestResidual) {
        // console.log('changing', residual, offsetObjs)
        bestResidual = residual;
        bestOffsets = offsetObjs;
        bestE = computeIntersectionForOffsets(observations, offsetObjs);
      }
      return;
    }
    for (const candidate of candidateFractions) {
      rec(i + 1, offsets.concat(candidate));
    }
  }
  rec(0, []);
  return { bestOffsets, bestResidual, bestE: bestE! };
}
/**
 * Final triangulation function that uses a candidate search over fractional offsets,
 * selects the combination that minimizes the residual cost (i.e. the sum of distances
 * from the computed event to each observation's ray), and returns the refined event coordinate.
 * The errorRadius is defined as the maximum distance from the refined event E to any intersection
 * computed from the candidate offsets.
 */
export function triangulateEventByResidual(
  observations: Observation[],
  candidateFractions: number[] = generateCandidateFractions(4)
): { estimatedX: number; estimatedZ: number; errorRadius: number; offsets: { dx: number; dz: number }[] } | null {
  if (observations.length === 0) return null;
  // Search the candidate space for the best offsets.
  const searchResult = searchCandidateOffsets(observations, candidateFractions);
  const bestE = searchResult.bestE;
  // console.log(bestE)
  const bestResidual = searchResult.bestResidual;

  // Next, compute the errorRadius by re-enumerating the candidate space and taking
  // the maximum distance from bestE to the candidate intersections.
  let maxDistance = 0;
  const n = observations.length;
  function rec(i: number, offsets: number[]) {
    if (i === 2 * n) {
      const offsetObjs: { dx: number; dz: number }[] = [];
      for (let j = 0; j < n; j++) {
        offsetObjs.push({ dx: offsets[2 * j], dz: offsets[2 * j + 1] });
      }
      const E = computeIntersectionForOffsets(observations, offsetObjs);
      const d = Math.hypot(E.x - bestE.x, E.z - bestE.z);
      if (d > maxDistance) {
        maxDistance = d;
      }
      return;
    }
    for (const candidate of candidateFractions) {
      rec(i + 1, offsets.concat(candidate));
    }
  }
  rec(0, []);

  return {
    estimatedX: bestE.x,
    estimatedZ: bestE.z,
    errorRadius: maxDistance,
    offsets: searchResult.bestOffsets
  };
}


/**
 * Uses simulated annealing to optimize the fractional offsets.
 * The state is an array of offsets (one dx and one dz per observation).
 * Returns the best offsets found, their cost, and the corresponding intersection.
 */
function optimizeOffsetsSA(
  observations: Observation[],
  initialTemp: number = 1,
  finalTemp: number = 1e-6,
  iterations: number = 10000,
  epsilon: number = 1e-8
): { bestOffsets: { dx: number; dz: number }[]; bestCost: number; bestE: Point } {
  const n = observations.length;
  let currentOffsets: { dx: number; dz: number }[] = Array(n).fill(0).map(() => ({ dx: 0.5, dz: 0.5 }));
  let currentCost = computeResidualCost(observations, currentOffsets);
  let currentE = computeIntersectionForOffsets(observations, currentOffsets);
  let bestOffsets = currentOffsets.map(o => ({ ...o }));
  let bestCost = currentCost;
  let bestE = currentE;
  let temp = initialTemp;
  // Exponential cooling schedule.
  const coolingRate = Math.pow(finalTemp / initialTemp, 1 / iterations);
  
  for (let iter = 0; iter < iterations; iter++) {
    // Propose new offsets by perturbing each observation's offsets by a small random value scaled by temp.
    const newOffsets = currentOffsets.map(o => {
      let newDx = o.dx + (Math.random() * 2 - 1) * temp;
      let newDz = o.dz + (Math.random() * 2 - 1) * temp;
      // Clamp values to [0,1]
      newDx = Math.max(0, Math.min(1, newDx));
      newDz = Math.max(0, Math.min(1, newDz));

      // round by epsilon
      newDx = Math.round(newDx / epsilon) * epsilon;
      newDz = Math.round(newDz / epsilon) * epsilon;
      return { dx: newDx, dz: newDz };
    });
    const newCost = computeResidualCost(observations, newOffsets);
    // If the new state is better, accept it; if not, accept it with a probability that decreases with temperature.
    if (newCost < currentCost || Math.random() < Math.exp((currentCost - newCost) / temp)) {
      currentOffsets = newOffsets;
      currentCost = newCost;
      currentE = computeIntersectionForOffsets(observations, newOffsets);
      if (newCost < bestCost) {
        bestCost = newCost;
        bestOffsets = newOffsets.map(o => ({ ...o }));
        bestE = currentE;
      }
    }
    temp *= coolingRate;
  }
  return { bestOffsets, bestCost, bestE };
}

/**
 * New triangulation function that uses simulated annealing to optimize the fractional offsets.
 * It returns the refined event coordinate, an error boundary called errorRadius, and the optimized offsets.
 */
export function triangulateEventOptimizedSA(
  observations: Observation[],
  initialTemp: number = 1,
  finalTemp: number = 1e-12,
  iterations: number = 100000,
  epsilon: number = 1e-99
): { estimatedX: number; estimatedZ: number; errorRadius: number; offsets: { dx: number; dz: number }[] } | null {
  if (observations.length === 0) return null;
  const nominalE = computeNominalIntersection(observations);
  const optResult = optimizeOffsetsSA(observations, initialTemp, finalTemp, iterations, epsilon);
  // const errorRadius = computeErrorRadiusSA(observations, optResult.bestOffsets, optResult.bestE, errorSamples, perturbation);
  const errorRadius = optimizedComprehensiveErrorRadius(observations, nominalE) //comprehensiveErrorRadius(observations, nominalE);
  // const errorRadius = linearWorstCaseError(observations, nominalE);
  return {
    estimatedX: optResult.bestE.x,
    estimatedZ: optResult.bestE.z,
    errorRadius,
    offsets: optResult.bestOffsets,
  };
}


/**
 * Computes the projection matrix for a given unit vector d:  I - d d^T.
 */
function projectionMatrix(d: Point): number[][] {
  return [
    [1 - d.x * d.x,     -d.x * d.z],
    [   -d.x * d.z, 1 - d.z * d.z]
  ];
}

/**
 * Computes the covariance matrix for the estimated event coordinate E
 * using covariance propagation from the observation uncertainties.
 *
 * We assume each observation has independent error with variance sigma^2
 * in the direction orthogonal to its ray. Then, the covariance is approximated as:
 *
 *   Cov(E) ≈ sigma^2 * ( Σ_i (I - d_i d_i^T) )^(-1)
 *
 * @param observations - The observations array.
 * @param sigma - The standard deviation of the error in each observation's measurement.
 * @returns A 2x2 covariance matrix.
 */
function computeCovariance(observations: Observation[], sigma: number): number[][] {
  const rays: Ray[] = observations.map(obs => {
    const origin: Point = { x: obs.playerX, z: obs.playerZ };
    const Q: Point = { x: obs.relX + 0.5, z: obs.relZ + 0.5 };
    const d = normalize({ x: Q.x - origin.x, z: Q.z - origin.z });
    return { origin, d };
  });
  // Sum the projection matrices.
  let S = [
    [0, 0],
    [0, 0]
  ];
  for (const ray of rays) {
    const P = projectionMatrix(ray.d);
    S[0][0] += P[0][0];
    S[0][1] += P[0][1];
    S[1][0] += P[1][0];
    S[1][1] += P[1][1];
  }
  // Invert the 2x2 matrix S.
  const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
  if (Math.abs(det) < 1e-8) {
    // Degenerate case; return a large covariance.
    return [
      [1e10, 0],
      [0, 1e10]
    ];
  }
  const invS = [
    [S[1][1] / det, -S[0][1] / det],
    [-S[1][0] / det, S[0][0] / det]
  ];
  // Multiply by sigma^2.
  invS[0][0] *= sigma * sigma;
  invS[0][1] *= sigma * sigma;
  invS[1][0] *= sigma * sigma;
  invS[1][1] *= sigma * sigma;
  return invS;
}

/**
 * Computes the maximum eigenvalue of a 2x2 matrix.
 * For matrix M = [a, b; c, d], eigenvalues are given by:
 *   λ = (a+d ± sqrt((a-d)^2 + 4*b*c)) / 2.
 */
function maxEigenvalue(M: number[][]): number {
  const a = M[0][0], b = M[0][1], c = M[1][0], d = M[1][1];
  const trace = a + d;
  const discriminant = Math.sqrt((a - d) * (a - d) + 4 * b * c);
  const lambda1 = (trace + discriminant) / 2;
  const lambda2 = (trace - discriminant) / 2;
  return Math.max(lambda1, lambda2);
}

/**
 * New triangulation function that uses covariance propagation.
 * It computes the nominal intersection using (0.5, 0.5) for each observation,
 * then computes the covariance matrix of the intersection, and returns an errorRadius
 * equal to the square root of the maximum eigenvalue of the covariance matrix.
 *
 * @param observations - The array of observations.
 * @param sigma - The standard deviation of the measurement error.
 * @returns An object containing estimatedX, estimatedZ, errorRadius, and the nominal offsets.
 */
export function triangulateEventCovariance(
  observations: Observation[],
  sigma: number = 1  // you may adjust sigma based on your expected error in Q.
): { estimatedX: number; estimatedZ: number; errorRadius: number; offsets: { dx: number; dz: number }[] } | null {
  if (observations.length === 0) return null;
  const nominal = computeNominalIntersection(observations);
  const cov = computeCovariance(observations, sigma);
  const maxEig = maxEigenvalue(cov);
  const errorRadius = Math.sqrt(maxEig);
  // Nominal offsets are (0.5, 0.5) for every observation.
  const offsets = observations.map(() => ({ dx: 0.5, dz: 0.5 }));
  return {
    estimatedX: nominal.x,
    estimatedZ: nominal.z,
    errorRadius,
    offsets
  };
}