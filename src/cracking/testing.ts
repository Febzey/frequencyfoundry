import { triangulateEvent, Observation, triangulateEventLinear, Point, triangulateEventByResidual, generateCandidateFractions, triangulateEventOptimizedSA } from "./triangulation";
import { computeRelativeCoords, generateExplosionLocation } from "./build_test_utils";
import { Vec3 } from "vec3";
import {  generateCircularObservations, generateCrossObservations, generateDiagonalCrossObservations, generateGridObservationsForN, generateObservations } from "./generators";
import { generateGraph } from "../drawing/draw";

interface SummaryRecord {
  observations: Observation[];
  offsets: {dx: number, dz: number}[];
  numBots: number;
  name: string;
  estimatedX: number;
  estimatedZ: number;
  errorRadius: number;
  distance: number;
}




/**
 * Runs all observation-generation methods for bot counts in the range [minBots, maxBots]
 * and produces a summary that shows:
 *   - For each number of bots, which configuration performs best (lowest distance to actual event)
 *   - Which overall bot count gives the best result.
 *
 * @param minBots - The minimum number of bot observations.
 * @param maxBots - The maximum number of bot observations.
 */
function compareConfigurations(minBots: number, maxBots: number, actual: {x: number, z: number}, method: (obs: Observation[], ...args:any[]) => any, ...args: any[]) {

  const viewDistance = 160; // Server's view distance


  console.log(`Generated Explosion at: (${actual.x}, ${actual.z})\n`);

  // Define our generation methods.
  // Note: For demonstration, we reuse the same functions as before.


  const generators: { name: string; func: (num: number) => Observation[] }[] = [
    // {name: "raw", func: (num: number) => {
    //   const raw: any[] = [
    //     { playerX: -80000, playerZ: -80000, relX: -79843, relZ: -80033 },
    //     { playerX: 80000, playerZ: -80000, relX: 80147, relZ: -80060 },
    //     { playerX: -80000, playerZ: 80000, relX: -79868, relZ: 79908 },
    //     { playerX: 80000, playerZ: 80000, relX: 80095, relZ: 79871 }
    //   ]
      
    //   const raw1 = raw.map(r => {
    //     const {relX, relZ } = computeRelativeCoords(actual.x, actual.z, r.playerX, r.playerZ, viewDistance);
    //     return { playerX: r.playerX, playerZ: r.playerZ, relX, relZ }
    //   })

    //   return raw1
      
    // }},
    
    // {
    //   name: "Random Observations",
    //   func: (num: number) =>
    //     generateObservations(
    //       num,
    //       actual.x,
    //       actual.z,
    //       minBotRadius,
    //       maxBotRadius,
    //       viewDistance
    //     ),
    // },
    {
      name: "Circular Observations",
      func: (num: number) =>
        generateCircularObservations(
          num,
          actual.x,
          actual.z,
          maxBotRadius,
          viewDistance
        ),
    },
    {
      name: "Grid Observations",
      func: (num: number) =>
        generateGridObservationsForN(
          num,
          maxBotRadius * 2,
          actual.x,
          actual.z,
          viewDistance
        ),
    },
    // {
    //   name: "Cross Observations",
    //   func: (num: number) =>
    //     generateCrossObservations(
    //       num,
    //       maxBotRadius * 2,
    //       actual.x,
    //       actual.z,
    //       viewDistance
    //     ),
    // },
    // {
    //   name: "Diagonal Cross Observations",
    //   func: (num: number) =>
    //     generateDiagonalCrossObservations(
    //       num,
    //       maxBotRadius* 2,
    //       actual.x,
    //       actual.z,
    //       viewDistance
    //     ),
    // },
  ];

  const summary: SummaryRecord[] = [];
  const sortWorstCase = (a: SummaryRecord, b: SummaryRecord) => a.errorRadius - b.errorRadius;
  const sortDistance = (a: SummaryRecord, b: SummaryRecord) => a.distance - b.distance;

  // Loop over number-of-bots from minBots to maxBots.
  for (let numBots = minBots; numBots <= maxBots; numBots++) {
    console.log(`\n=== Results for ${numBots} bot observations ===`);
    // For each generation method, generate observations and run triangulation.
    generators.forEach((gen) => {
      const observations = gen.func(numBots);
      const start = performance.now();
      const result = method(observations, ...args);
      if (result) {
        const dist = Math.hypot(result.estimatedX - actual.x, result.estimatedZ - actual.z);
        console.log(` === ${gen.name} ===`)
        // console.log(observations)
        console.log("  Estimated event coordinate:", Math.floor(result.estimatedX), Math.floor(result.estimatedZ));
        console.log("  Worst-case error (blocks):", result.errorRadius);
        console.log("  Distance to actual event location:", dist);
        console.log("  Computation time:", performance.now() - start, "ms");
      
        let offsets: {dx: number, dz: number}[] = []
        if (result.offsets != null) offsets = result.offsets
        else {
          for (let i = 0; i < observations.length; i++) {
            offsets.push({dx: 0.5, dz: 0.5})
          }
        }
        summary.push({
          observations,
          numBots,
          name: gen.name,
          estimatedX: result.estimatedX,
          estimatedZ: result.estimatedZ,
          errorRadius: result.errorRadius,
          distance: dist,
          offsets: offsets
        });
      } else {
        console.log(`${gen.name}: Triangulation returned null.`);
      }
    });
  }

  // Group summary by bot count.
  const bestPerCount: { [key: number]: SummaryRecord } = {};
  for (let numBots = minBots; numBots <= maxBots; numBots++) {
    const recs = summary.filter((s) => s.numBots === numBots);
    if (recs.length > 0) {
      // Find the record with the smallest distance.
      recs.sort(sortWorstCase);
      bestPerCount[numBots] = recs[0];
    }
  }

  console.log("\n--- Best Configuration per Number of Bots ---");
  for (let numBots = minBots; numBots <= maxBots; numBots++) {
    if (bestPerCount[numBots]) {
      const s = bestPerCount[numBots];
      console.log(numBots, "bots:", s.name, "\n  Estimated:", 
      "(", Math.floor(s.estimatedX), Math.floor(s.estimatedZ), ")",
      "\n  Distance:", s.distance,
      "\n  Worst-case error:", s.errorRadius);
    }
  }

  // Now, determine the overall best configuration (lowest distance) across all bot counts.
  summary.sort(sortWorstCase);
  const overallBest = summary[0];
  console.log(`\n--- Overall Best Configuration For: ${method.name} ---`);
  console.log(
    overallBest.numBots, "bots with", overallBest.name, "\n  Estimated:", 
    Math.floor(overallBest.estimatedX), Math.floor(overallBest.estimatedZ), 
    "\n  Distance:", overallBest.distance, 
    "\n  Worst-case error:", overallBest.errorRadius
  );

  const obj = {...overallBest, actualX: actual.x, actualZ: actual.z}
  generateGraph(overallBest.observations, obj, `${method.name}.png`, {drawErrorRegion: true, scale: 1.1})

  summary.sort(sortDistance);
  const overallBestDistance = summary[0];
  console.log("\n--- Overall Best Configuration by Distance ---");
  console.log(
    overallBestDistance.numBots, "bots with", overallBestDistance.name, "\n  Estimated:", 
    Math.floor(overallBestDistance.estimatedX), Math.floor(overallBestDistance.estimatedZ), 
    "\n  Distance:", overallBestDistance.distance, 
    "\n  Worst-case error:", overallBestDistance.errorRadius
  );
  console.log("\nActual Explosion Location:", actual);

}

const minBots = 8;
const maxBots = 8;

// World/explosion settings.
const minWorldRadius = 10; // Minimum radius from the origin
const maxWorldRadius = 29_000_000; // Maximum radius (world boundary)

// Bot placement settings (for methods that use a radius).
const minBotRadius = 0; // Minimum radius for bot placement
const maxBotRadius = 29_000_000 ; // Maximum radius for bot placement

// Generate a random explosion location.
const actual = process.argv.length > 2 ? {x: parseInt(process.argv[2]), z: parseInt(process.argv[3])} : generateExplosionLocation(minWorldRadius, maxWorldRadius);

// Example execution: compare results for bot counts from 9 to 12.
// compareConfigurations(minBots, maxBots, actual, triangulateEvent);
compareConfigurations(minBots, maxBots, actual, triangulateEventLinear);
// compareConfigurations(minBots, maxBots, actual, triangulateEventByResidual, generateCandidateFractions(4));
compareConfigurations(minBots, maxBots, actual, triangulateEventOptimizedSA);

// compareConfigurations(minBots, maxBots, actual, triangulateEventCovariance);