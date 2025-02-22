import { generateExplosionLocation } from "../cracking/build_test_utils"
import { generateGridObservationsForN } from "../cracking/generators"
import { triangulateEventLinear } from "../cracking/triangulation"
import { RayInput, generateGraph } from "./draw"
import { computeOverlappingRegion } from "./test1"

const minRadius = 1000
const maxRadius = 10000
const maxBotRadius = 5000
const viewDistance = 160
const numBots = 4

const actual = generateExplosionLocation(minRadius, maxRadius)

//
// 1) Your Data
//
const inputs: RayInput[] = generateGridObservationsForN(numBots, maxBotRadius, actual.x, actual.z, viewDistance);

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

generateGraph(inputs, found, "output.png", {drawErrorRegion: true, drawTargetLines: false, scale: 1.2});


// const overlappingRegion = computeOverlappingRegion(inputs);
// console.log(JSON.stringify(overlappingRegion, null, 2));
