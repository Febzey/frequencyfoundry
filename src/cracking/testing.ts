import { triangulateEvent, Observation, triangulateEvent1, triangulateEvent2, triangulateEventLinear, Point } from "./triangulation";
import { computeRelativeCoords } from "./build_test_utils";
import { Vec3 } from "vec3";
import {  generateCircularObservations, generateCrossObservations, generateDiagonalCrossObservations, generateGridObservationsForN, generateObservations } from "./generators";

interface SummaryRecord {
  numBots: number;
  name: string;
  estimatedX: number;
  estimatedZ: number;
  worstCaseError: number;
  distance: number;
}

/**
 * Generates a random explosion location within a specified radius range.
 *
 * @param minRadius - The minimum radius from the origin.
 * @param maxRadius - The maximum radius (world boundary).
 * @returns The actual explosion coordinates as an object { x, z }.
 */
function generateExplosionLocation(minRadius: number, maxRadius: number): { x: number; z: number } {
  // Generate a random angle in radians (0 to 2π)
  const theta = Math.random() * 2 * Math.PI;

  // Generate a random radius between minRadius and maxRadius
  const r = Math.sqrt(Math.random() * (maxRadius ** 2 - minRadius ** 2) + minRadius ** 2);

  // Convert polar to Cartesian coordinates
  const explosionX = Math.floor(r * Math.cos(theta));
  const explosionZ = Math.floor(r * Math.sin(theta));

  return { x: explosionX, z: explosionZ };
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
function compareConfigurations(minBots: number, maxBots: number) {
  // World/explosion settings.
  const minWorldRadius = 1_000_000; // Minimum radius from the origin
  const maxWorldRadius = 29_900_000; // Maximum radius (world boundary)
  const viewDistance = 160; // Server's view distance

  // Bot placement settings (for methods that use a radius).
  const minBotRadius = 9_900_000; // Minimum radius for bot placement
  const maxBotRadius = 9_900_000; // Maximum radius for bot placement

  // Generate a random explosion location.
  const actual = process.argv.length > 2 ? {x: parseInt(process.argv[2]), z: parseInt(process.argv[3])} : generateExplosionLocation(minWorldRadius, maxWorldRadius);
  console.log(`Generated Explosion at: (${actual.x}, ${actual.z})\n`);

  // Define our generation methods.
  // Note: For demonstration, we reuse the same functions as before.

  const generators1 = [
    {name: "raw", func: (num: number) => {
      const raw = [
        { playerX: 13012557, playerZ: 5404072, relX: 13012692, relZ: 5404156 } ,
        { playerX: 114334, playerZ: -16618210, relX: 114436, relZ: -16618087 } ,
        {
          playerX: -629016,
          playerZ: -11915700,
          relX: -13361432,
          relZ: -15399474
        } ,
        {
          playerX: 11729256,
          playerZ: 18717008,
          relX: 11729399,
          relZ: 18716936
        } ,
        {
          playerX: 5337432,
          playerZ: 18962391,
          relX: -11153881,
          relZ: -4531048
        } ,
        {
          playerX: 15915589,
          playerZ: -6590334,
          relX: 15915653,
          relZ: -6590187
        } ,
        { playerX: 8700238, playerZ: 13891888, relX: 8700397, relZ: 13891873 } ,
        { playerX: 6032054, playerZ: -7384944, relX: 6032162, relZ: -7384826 } ,
      ]
      
      const raw1 = raw.map(r => {
        const {relX, relZ } = computeRelativeCoords(actual.x, actual.z, r.playerX, r.playerZ, viewDistance);
        return { playerX: r.playerX, playerZ: r.playerZ, relX, relZ }
      })

      console.log(raw1)
      return raw1
      
    }}
  ]
  const generators: { name: string; func: (num: number) => Observation[] }[] = [
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
          (minBotRadius + maxBotRadius) / 2,
          viewDistance
        ),
    },
    {
      name: "Grid Observations",
      func: (num: number) =>
        generateGridObservationsForN(
          num,
          ((minBotRadius + maxBotRadius) / 2) * 2,
          actual.x,
          actual.z,
          viewDistance
        ),
    },
    {
      name: "Cross Observations",
      func: (num: number) =>
        generateCrossObservations(
          num,
          ((minBotRadius + maxBotRadius) / 2) * 2,
          actual.x,
          actual.z,
          viewDistance
        ),
    },
    {
      name: "Diagonal Cross Observations",
      func: (num: number) =>
        generateDiagonalCrossObservations(
          num,
          ((minBotRadius + maxBotRadius) / 2) * 2,
          actual.x,
          actual.z,
          viewDistance
        ),
    },
  ];

  const summary: SummaryRecord[] = [];
  const sortWorstCase = (a: SummaryRecord, b: SummaryRecord) => a.worstCaseError - b.worstCaseError;
  const sortDistance = (a: SummaryRecord, b: SummaryRecord) => a.distance - b.distance;

  // Loop over number-of-bots from minBots to maxBots.
  for (let numBots = minBots; numBots <= maxBots; numBots++) {
    console.log(`\n=== Results for ${numBots} bot observations ===`);
    // For each generation method, generate observations and run triangulation.
    generators.forEach((gen) => {
      const observations = gen.func(numBots);
      const result = triangulateEventLinear(observations);
      if (result) {
        const dist = Math.hypot(result.estimatedX - actual.x, result.estimatedZ - actual.z);
        console.log(` === ${gen.name} ===`)
        // console.log(observations)
        console.log("  Estimated event coordinate:", Math.floor(result.estimatedX), Math.floor(result.estimatedZ));
        console.log("  Worst-case error (blocks):", result.errorRadius);
        console.log("  Distance to actual event location:", dist);
        summary.push({
          numBots,
          name: gen.name,
          estimatedX: result.estimatedX,
          estimatedZ: result.estimatedZ,
          worstCaseError: result.errorRadius,
          distance: dist,
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
      "\n  Worst-case error:", s.worstCaseError);
    }
  }

  // Now, determine the overall best configuration (lowest distance) across all bot counts.
  summary.sort(sortWorstCase);
  const overallBest = summary[0];
  console.log("\n--- Overall Best Configuration ---");
  console.log(
    overallBest.numBots, "bots with", overallBest.name, "\n  Estimated:", 
    Math.floor(overallBest.estimatedX), Math.floor(overallBest.estimatedZ), 
    "\n  Distance:", overallBest.distance, 
    "\n  Worst-case error:", overallBest.worstCaseError
  );

  summary.sort(sortDistance);
  const overallBestDistance = summary[0];
  console.log("\n--- Overall Best Configuration by Distance ---");
  console.log(
    overallBestDistance.numBots, "bots with", overallBestDistance.name, "\n  Estimated:", 
    Math.floor(overallBestDistance.estimatedX), Math.floor(overallBestDistance.estimatedZ), 
    "\n  Distance:", overallBestDistance.distance, 
    "\n  Worst-case error:", overallBestDistance.worstCaseError
  );
}

// Example execution: compare results for bot counts from 9 to 12.
compareConfigurations(4, 16);