# Wither Spawn Mapping Project

Over the past few weeks we’ve been building a system to track and triangulate wither spawns on Minecraft servers. Most players only hear the global wither sound, but the server actually sends a pair of coordinates along with it. These aren’t the exact spawn points — they represent the furthest block within a player’s render distance in the direction of the sound. That means even sounds tens of millions of blocks away produce “pointer blocks” that we can observe.

By running multiple accounts simultaneously, each collecting these pointers, we can turn each observation into a vector pointing towards the wither. Using simple geometry, we then determine the intersection of these vectors to pinpoint the spawn location. In short, for observations `O_1, O_2, ..., O_n` from players at positions `P_i = (x_i, z_i)`, each observation provides an angle `θ_i` such that the line from `P_i` in direction `θ_i` intersects the unknown spawn location `S = (X, Z)`. Solving for the intersection of these lines gives:

```
S = argmin_S sum_{i=1}^{n} distance(S, L_i)^2
```

where `L_i` is the line derived from the `i`-th observation.

All collected data is logged to a database, giving us a live map of spawns, hidden bases, and patterns of wither activity.

## Triangulation Code Snippets

Convert a player observation into a half-plane representing the wedge:

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
  const lineMin = lineFromPointAngle(P, Math.min(...angles));
  const lineMax = lineFromPointAngle(P, Math.max(...angles));
  return [{ a: lineMin.a, b: lineMin.b, c: lineMin.c }, { a: lineMax.a, b: lineMax.b, c: lineMax.c }];
}
```

Intersect a set of half-planes to compute the feasible spawn region:

```ts
function intersectHalfPlanes(hpList: HalfPlane[]): Point[] {
  let polygon: Point[] = [
    { x: -1e9, z: -1e9 },
    { x: 1e9, z: -1e9 },
    { x: 1e9, z: 1e9 },
    { x: -1e9, z: 1e9 },
  ];
  for (const hp of hpList) polygon = clipPolygonAgainstHalfPlane(polygon, hp);
  return polygon;
}
```

The system works like a high-precision sonar: each account listens, records, and points towards the wither, and a little geometry magic tells us where it actually spawned. By combining data over time, we’ve been able to uncover hidden bases and generate detailed maps of server activity.

Hope you enjoyed this little readme
