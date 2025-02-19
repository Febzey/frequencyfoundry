import { computeRelativeCoords } from "./build_test_utils";
import { Observation, Point } from "./triangulation";

/**
 * Generates observations for a specified number of bots.
 * 
 * @param numberOfBots - The number of bot observations to generate.
 * @param explosionX - The x-coordinate of the explosion.
 * @param explosionZ - The z-coordinate of the explosion.
 * @param minRadius - The minimum radius for bot positioning.
 * @param maxRadius - The maximum radius for bot positioning.
 * @param viewDistance - The server's view distance (e.g., 160).
 * @returns An array of Observation objects.
 */
export function generateObservations(
    numberOfBots: number,
    explosionX: number,
    explosionZ: number,
    minRadius: number,
    maxRadius: number,
    viewDistance: number
): Observation[] {
    const observations: Observation[] = [];

    for (let i = 0; i < numberOfBots; i++) {
        // Generate a random angle in radians (0 to 2π)
        const theta = Math.random() * 2 * Math.PI;

        // Generate a random radius between minRadius and maxRadius
        const r = Math.sqrt(Math.random() * (maxRadius ** 2 - minRadius ** 2) + minRadius ** 2);

        // Convert polar to Cartesian coordinates
        const playerX = Math.floor(r * Math.cos(theta));
        const playerZ = Math.floor(r * Math.sin(theta));

        // Compute the relative coordinates using the computeRelativeCoords function
        const { relX, relZ } = computeRelativeCoords(explosionX, explosionZ, playerX, playerZ, viewDistance);

        observations.push({
            playerX: playerX,
            playerZ: playerZ,
            relX: relX,
            relZ: relZ,
        });
    }

    return observations;
}


/**
 * Generates observations uniformly distributed in a circle at a specific radius.
 * 
 * @param numberOfBots - The number of bot observations to generate.
 * @param explosionX - The x-coordinate of the explosion.
 * @param explosionZ - The z-coordinate of the explosion.
 * @param circleRadius - The fixed radius at which bots are placed around the origin.
 * @param viewDistance - The server's view distance (e.g., 160).
 * @returns An array of Observation objects.
 */
export function generateCircularObservations(
    numberOfBots: number,
    explosionX: number,
    explosionZ: number,
    circleRadius: number,
    viewDistance: number
): Observation[] {
    const observations: Observation[] = [];

    for (let i = 0; i < numberOfBots; i++) {
        // Distribute angles uniformly around the circle
        const theta = (i / numberOfBots) * 2 * Math.PI;

        // Compute Cartesian coordinates on the circle
        const playerX = Math.floor(circleRadius * Math.cos(theta));
        const playerZ = Math.floor(circleRadius * Math.sin(theta));

        // Compute the relative coordinates using the computeRelativeCoords function
        const { relX, relZ } = computeRelativeCoords(explosionX, explosionZ, playerX, playerZ, viewDistance);

        observations.push({
            playerX: playerX,
            playerZ: playerZ,
            relX: relX,
            relZ: relZ,
        });
    }

    return observations;
}

/**
 * Generates observations arranged in a grid within a square.
 * 
 * The grid dimensions are computed from the number of bots so that they
 * are as evenly distributed as possible. For instance, if there are 10 bots,
 * we might use 4 rows and 3 columns.
 * 
 * @param numberOfBots - The number of bot observations to generate.
 * @param squareSize - The side length of the square (in meters).
 * @param explosionX - The x-coordinate of the explosion.
 * @param explosionZ - The z-coordinate of the explosion.
 * @param viewDistance - The server's view distance (e.g., 160).
 * @returns An array of Observation objects.
 */
export function generateGridObservationsForN(
  numberOfBots: number,
  squareSize: number,
  explosionX: number,
  explosionZ: number,
  viewDistance: number
): Observation[] {
  const observations: Observation[] = [];

  // Determine grid dimensions.
  const rows = Math.ceil(Math.sqrt(numberOfBots));
  const cols = Math.ceil(numberOfBots / rows);

  // Compute cell dimensions.
  const cellWidth = squareSize / cols;
  const cellHeight = squareSize / rows;

  // Place each observation in the center of its cell.
  for (let i = 0; i < numberOfBots; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // The square extends from -squareSize/2 to +squareSize/2 in both axes.
    const offset = squareSize / 2;


    // Position in the square:
    const playerX = (col + 0.5) * cellWidth - offset;
    const playerZ = (row + 0.5) * cellHeight - offset;


    // Compute the reported relative coordinate using the provided function.
    const { relX, relZ } = computeRelativeCoords(explosionX, explosionZ, playerX, playerZ, viewDistance);

    observations.push({
      playerX,
      playerZ,
      relX,
      relZ,
    });
  }

  return observations;
}


export function generateCrossObservations(
    numberOfBots: number,
    crossSize: number,
    explosionX: number,
    explosionZ: number,
    viewDistance: number
  ): Observation[] {
    const observations: Observation[] = [];
    
    // Determine number of points on each arm.
    // We require H + V - 1 = numberOfBots.
    // Choose H = ceil((numberOfBots + 1)/2) and V = floor((numberOfBots + 1)/2).
    const H = Math.ceil((numberOfBots + 1) / 2);
    const V = Math.floor((numberOfBots + 1) / 2);
    
    // The arms span from -halfSize to +halfSize.
    const halfSize = crossSize / 2;
    
    // Generate horizontal arm: y = 0, H points equally spaced from -halfSize to +halfSize.
    const horizontal: Point[] = [];
    if (H > 1) {
      for (let i = 0; i < H; i++) {
        const x = -halfSize + (i * crossSize) / (H - 1);
        horizontal.push({ x, z: 0 });
      }
    } else {
      // If only one point is needed, place it at center.
      horizontal.push({ x: 0, z: 0 });
    }
    
    // Generate vertical arm: x = 0, V points equally spaced from -halfSize to +halfSize.
    const vertical: Point[] = [];
    if (V > 1) {
      for (let i = 0; i < V; i++) {
        const z = -halfSize + (i * crossSize) / (V - 1);
        vertical.push({ x: 0, z });
      }
    } else {
      vertical.push({ x: 0, z: 0 });
    }
    
    // Combine the two sets, removing duplicates (the center (0,0) appears in both).
    const uniquePoints: Point[] = [];
    const seen = new Set<string>();
    for (const p of [...horizontal, ...vertical]) {
      const key = `${p.x},${p.z}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePoints.push(p);
      }
    }
    
    // For each point, compute the reported relative coordinate.
    for (const point of uniquePoints) {
      const { relX, relZ } = computeRelativeCoords(explosionX, explosionZ, point.x, point.z, viewDistance);
      observations.push({
        playerX: point.x,
        playerZ: point.z,
        relX,
        relZ,
      });
    }
    
    return observations;
  }


  /**
 * Generates observations arranged in a diagonal cross (X-shape) pattern centered at (0,0).
 *
 * The diagonal cross consists of two arms:
 *  - Diagonal D₁: from (-halfSize, -halfSize) to (halfSize, halfSize)
 *  - Diagonal D₂: from (-halfSize, halfSize) to (halfSize, -halfSize)
 *
 * The center (0,0) is shared, so total unique points = countD1 + countD2 - 1.
 * We choose:
 *    countD1 = ceil((numberOfBots + 1) / 2)
 *    countD2 = floor((numberOfBots + 1) / 2)
 * so that (countD1 + countD2 - 1) equals numberOfBots.
 *
 * @param numberOfBots - The total number of observations desired.
 * @param crossSize - The full extent of each diagonal arm (in meters). For example, if crossSize = 60,
 *                    then the arms span from -30 to +30.
 * @param explosionX - The x-coordinate of the explosion.
 * @param explosionZ - The z-coordinate of the explosion.
 * @param viewDistance - The server's view distance (e.g., 160).
 * @returns An array of Observation objects.
 */
export function generateDiagonalCrossObservations(
    numberOfBots: number,
    crossSize: number,
    explosionX: number,
    explosionZ: number,
    viewDistance: number
  ): Observation[] {
    const observations: Observation[] = [];
    const halfSize = crossSize / 2;
  
    // Determine how many points go on each diagonal arm.
    // Total unique points = countD1 + countD2 - 1 = numberOfBots.
    const countD1 = Math.ceil((numberOfBots + 1) / 2);
    const countD2 = Math.floor((numberOfBots + 1) / 2);
  
    // Generate diagonal D₁: from (-halfSize, -halfSize) to (halfSize, halfSize)
    const diag1: Point[] = [];
    if (countD1 > 1) {
      for (let i = 0; i < countD1; i++) {
        const t = i / (countD1 - 1); // parameter in [0,1]
        const x = -halfSize + 2 * halfSize * t;
        const z = -halfSize + 2 * halfSize * t;
        diag1.push({ x, z });
      }
    } else {
      diag1.push({ x: 0, z: 0 });
    }
  
    // Generate diagonal D₂: from (-halfSize, halfSize) to (halfSize, -halfSize)
    const diag2: Point[] = [];
    if (countD2 > 1) {
      for (let i = 0; i < countD2; i++) {
        const t = i / (countD2 - 1);
        const x = -halfSize + 2 * halfSize * t;
        const z = halfSize - 2 * halfSize * t;
        diag2.push({ x, z });
      }
    } else {
      diag2.push({ x: 0, z: 0 });
    }
  
    // Combine the two sets of points, removing duplicates (the center (0,0) appears in both).
    const uniquePoints: Point[] = [];
    const seen = new Set<string>();
    for (const p of [...diag1, ...diag2]) {
      // Use fixed precision to account for floating-point differences.
      const key = `${p.x.toFixed(6)},${p.z.toFixed(6)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePoints.push(p);
      }
    }
  
    // For each unique point, compute the reported relative coordinate.
    for (const point of uniquePoints) {
      const { relX, relZ } = computeRelativeCoords(explosionX, explosionZ, point.x, point.z, viewDistance);
      observations.push({
        playerX: point.x,
        playerZ: point.z,
        relX,
        relZ,
      });
    }
  
    return observations;
  }
