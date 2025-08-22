# Wither Spawn Mapping Project

Ever wondered where Withers actually spawn? We went deep and mapped them almost down to the block. This isn’t just tracking, it’s precision triangulation using Minecraft in ways few players even realize are possible.

## The Mission

Minecraft servers (Paper, Folia) technically send Wither spawn sounds globally. Most players only hear the sound, but the server actually sends a pair of coordinates with each spawn. The twist is that these coordinates aren’t the Wither’s exact location. They point to the furthest block from the player in render distance toward the sound. Even if the Wither is millions of blocks away, the server gives a hint inside your render distance.

Our goal was to use this subtle hint to pinpoint the actual Wither location.

## How We Did It

We used three to four accounts at the same time, each logging the coordinate hints. Each observation became a vector pointing toward the sound. Using triangulation and probability, we determined where all these vectors intersected. Every spawn was logged, bases were discovered, and everything was stored in a database for later analysis.

The key formula behind our triangulation is

\[
x = \frac{c_1 b_2 - b_1 c_2}{a_1 b_2 - b_1 a_2}, \quad
z = \frac{a_1 c_2 - c_1 a_2}{a_1 b_2 - b_1 a_2}
\]

Each line comes from a player's observation converted into the normal form  

\[
a x + b z = c
\]

Every Wither spawn is basically the intersection of multiple lines like this.

## Code Highlights

Here’s some of the coolest parts of the code:

```ts
function lineFromPointAngle(P: Point, theta: number) {
  const nx = -Math.sin(theta)
  const nz = Math.cos(theta)
  const c = nx * P.x + nz * P.z
  return { a: nx, b: nz, c }
}

function buildErrorRegion(observations: Observation[]): Point[] {
  let halfPlanes: HalfPlane[] = []
  for (const obs of observations) {
    halfPlanes.push(...getWedgeHalfPlanes(obs))
  }
  return intersectHalfPlanes(halfPlanes)
}
```

Our triangulateEventLinear function turns these observations into precise coordinates and even outputs a visual map showing the actual spawn and the calculated polygon.

## Why It’s Cool

It explores hidden server mechanics most players don’t know exist. It combines geometry, probability, and Minecraft observations into one workflow. Every spawn is recorded, every line intersected, every base discovered. It’s also meant to encourage readers to dive into the code and experiment, seeing how close they can get to pinpointing a Wither themselves.

This is more than code. It’s a map of discovery, a blend of math, strategy, and Minecraft wizardry. Dive in and see how deep the rabbit hole goes.