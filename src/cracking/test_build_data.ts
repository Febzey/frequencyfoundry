

/**
 * Mimics Java's (int) cast from double to int (truncation toward zero).
 * For positive numbers it uses Math.floor (after subtracting a small epsilon)
 * and for negative numbers it uses Math.ceil (after adding a small epsilon).
 */
function javaInt(x: number, eps: number = 1e-9): number {
  if (x >= 0) {
    return Math.floor(x - eps);
  } else {
    return Math.ceil(x + eps);
  }
}

/**
 * Given the explosion's absolute coordinates (explosionX, explosionZ),
 * the player's position (playerX, playerZ), and the viewDistance,
 * compute the relative block coordinate.
 *
 * If the player is farther than viewDistance away from the explosion,
 * the relative coordinate is computed by projecting along the ray from
 * the player to the explosion by the viewDistance and then converting
 * that coordinate to int (truncating toward zero).
 *
 * Otherwise, the explosion's block position (floored) is used.
 */
export function computeRelativeCoords(
  explosionX: number,
  explosionZ: number,
  playerX: number,
  playerZ: number,
  viewDistance: number
): { relX: number; relZ: number } {
  const deltaX = explosionX - playerX;
  const deltaZ = explosionZ - playerZ;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;

  if (distanceSq > viewDistance * viewDistance) {
    const distance = Math.sqrt(distanceSq);
    const relativeX = playerX + (deltaX / distance) * viewDistance;
    const relativeZ = playerZ + (deltaZ / distance) * viewDistance;
    return { relX: javaInt(relativeX), relZ: javaInt(relativeZ) };
  } else {
    return { relX: Math.floor(explosionX), relZ: Math.floor(explosionZ) };
  }
}
