// drawPolygon.ts
import { Canvas, createCanvas } from "canvas";
import * as fs from "fs";
import { buildErrorRegion, Point, Observation } from "./polygonUtils";
import { BoundingBox, computeBoundingBox, toCanvasCoords } from "./canvasUtils";

/**
 * Draws the polygon (error region) on a canvas and saves it as a PNG.
 * @param observations - The array of observations (used to compute the polygon).
 * @param outputFile - The filename to save the output image.
 */
export function drawErrorRegionPolygon(observations: Observation[], canvas: Canvas, bbox: BoundingBox): void {

}

// Example usage:
// import { drawErrorRegionPolygon } from "./drawPolygon";
// import { generateGridObservationsForN } from "./generators";
// import { generateExplosionLocation } from "./build_test_utils";
import { generateGridObservationsForN } from "../cracking/generators";
const inputs: Observation[] = generateGridObservationsForN(4, 100, 1000, 1000, 160);
