# Wither Spawn Mapping Project

Ever wondered where Withers actually spawn? We went deep and mapped them almost down to the block. This isn’t just tracking, it’s precision triangulation using Minecraft in ways few players even realize are possible.

## The Mission

Minecraft servers (Paper, Folia) technically send Wither spawn sounds globally. Most players only hear the sound, but the server actually sends a pair of coordinates with each spawn. The twist is that these coordinates aren’t the Wither’s exact location. They point to the furthest block from the player in render distance toward the sound. Even if the Wither is millions of blocks away, the server gives a hint inside your render distance.

Our goal was to use this subtle hint to pinpoint the actual Wither location.

## How We Did It

We used three to four accounts at the same time, each logging the coordinate hints. Each observation became a vector pointing toward the sound. Using triangulation and probability, we determined where all these vectors intersected. Every spawn was logged, bases were discovered, and everything was stored in a database for later analysis.

The key formula behind our triangulation is

$$
x = \frac{c_1 b_2 - b_1 c_2}{a_1 b_2 - b_1 a_2}, \quad
z = \frac{a_1 c_2 - c_1 a_2}{a_1 b_2 - b_1 a_2}
$$

Each line comes from a player's observation converted into the normal form:

$$
a x + b z = c
$$

Every Wither spawn is basically the intersection of multiple lines like this.

## Code Highlights

Here’s a snippet out of the thousands of lines of code:

```ts
function getWedgeHalfPlanes(obs: Observation): HalfPlane[] {
  const P = { x: obs.playerX, z: obs.playerZ };
  const corners = [
    { x: obs.relX, z: obs.relZ },
    { x: obs.relX + 1, z: obs.relZ },
    { x: obs.relX, z: obs.relZ + 1 },
    { x: obs.relX + 1, z: obs.relZ + 1 },
  ];
  const angles = corners.map(c => Math.atan2(c.z - P.z, c.x - P.x));
  const thetaMin = Math.min(...angles);
  const thetaMax = Math.max(...angles);
  return [lineFromPointAngle(P, thetaMin), lineFromPointAngle(P, thetaMax)];
}

export function intersectHalfPlanes(hpList: HalfPlane[]): Point[] {
  let polygon: Point[] = [
    { x: -1e9, z: -1e9 },
    { x: 1e9, z: -1e9 },
    { x: 1e9, z: 1e9 },
    { x: -1e9, z: 1e9 },
  ];

  for (const hp of hpList) {
    polygon = clipPolygonAgainstHalfPlane(polygon, hp);
    if (polygon.length === 0) break;
  }

  return polygon;
}
```
- `getWedgeHalfPlanes` takes a single player’s observation of a wither sound and turns it into two “lines” forming a wedge. These wedges represent the possible directions the wither could be in from that player’s perspective. Each observation gives a constraint on the location.

- `intersectHalfPlanes` takes all the wedges from multiple players and finds the region where they all overlap. This intersection is the feasible area where the wither actually spawned. By combining observations like this, we can narrow down thousands of possible blocks to a tiny polygon.
## Why It’s Cool

It explores hidden server mechanics most players don’t know exist. It combines geometry, probability, and Minecraft observations into one workflow. Every spawn is recorded, every line intersected, every base discovered. It’s also meant to encourage readers to dive into the code and experiment, seeing how close they can get to pinpointing a Wither themselves.

This is more than code. It’s a map of discovery, a blend of math, strategy, and Minecraft wizardry. Dive in and see how deep the rabbit hole goes.

credits: febzey,mixldn,gen