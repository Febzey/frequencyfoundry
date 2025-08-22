import { Vec3 } from 'vec3';

interface Position {
    x: number;
    y: number;
    z: number;
}

interface Line3D {
    origin: Position;
    direction: Position;
}

interface ForgeConfig {
    clampDistance: number;
    minY: number;
    viewDistance: number;
}

export default class SoundWaveForge {

    static calculateAccurateWitherSpawn(
        bot1Pos: Position, bot1SoundPos: Position,
        bot2Pos: Position, bot2SoundPos: Position,
        forgeConfig: ForgeConfig
    ): { x: number; y: number; z: number; error: number } | null {
        const line1 = this.calculateLine(bot1Pos, bot1SoundPos);
        const line2 = this.calculateLine(bot2Pos, bot2SoundPos);
        const intersection = this.findIntersection(line1, line2);
        if (!intersection) return null;
        const angle = this.getAngleBetweenLines(line1.direction, line2.direction);
        const error = angle < 0.0001 ? Infinity : 1 / Math.sin(angle);
        const finalPos = this.clampIntersection(new Vec3(bot1Pos.x, 0, bot1Pos.z), new Vec3(intersection.x, intersection.y, intersection.z), forgeConfig.clampDistance);
        return { ...finalPos, error };
    }

    static calculateFinalIntersection(
        botPosA: Position, i12: Position,
        botPosB: Position, i34: Position,
        forgeConfig: ForgeConfig
    ): Position | null {
        const lineA = this.calculateLine(botPosA, i12);
        const lineB = this.calculateLine(botPosB, i34);
        const intersection = this.findIntersection(lineA, lineB);
        if (!intersection) return null;
        const finalPos = this.clampIntersection(new Vec3(botPosA.x, 0, botPosA.z), new Vec3(intersection.x, intersection.y, intersection.z), forgeConfig.clampDistance);
        return finalPos;
    }

    static triangulateEventLinear(
        bot1Pos: Position, w1Pos: Position,
        bot2Pos: Position, w2Pos: Position,
        bot3Pos: Position, w3Pos: Position,
        forgeConfig: ForgeConfig
    ): Position | null {
        const line1 = this.calculateLine(bot1Pos, w1Pos);
        const line2 = this.calculateLine(bot2Pos, w2Pos);
        const line3 = this.calculateLine(bot3Pos, w3Pos);

        // For a basic approach, sample fractions [0..1] in small steps on line1,
        // find nearest points on lines2,3, pick minimal total residual.
        let bestPoint: Vec3 | null = null;
        let bestResidual = Number.MAX_VALUE;

        const steps = 20; // adjustable
        for (let i = 0; i <= steps; i++) {
            const frac = i / steps;
            const p1 = this.pointOnLine(line1, frac);

            // For lines 2,3, find the fraction that leads to the closest approach
            const p2 = this.bestFractionPoint(line2, p1, steps);
            const p3 = this.bestFractionPoint(line3, p1, steps);

            const residual = p1.distanceTo(p2) + p1.distanceTo(p3);
            if (residual < bestResidual) {
                bestResidual = residual;
                bestPoint = p1.clone();
            }
        }
        if (!bestPoint) return null;

        // clamp & apply minY
        let finalPos = this.clampIntersection(new Vec3(bot1Pos.x, 0, bot1Pos.z), bestPoint, forgeConfig.clampDistance);
        finalPos = new Vec3(finalPos.x, Math.max(finalPos.y, forgeConfig.minY), finalPos.z);
        return { x: finalPos.x, y: finalPos.y, z: finalPos.z };
    }

    private static calculateLine(bPosition: Position, wPosition: Position): Line3D {
        const origin = new Vec3(bPosition.x, bPosition.y, bPosition.z);
        const wVec = new Vec3(wPosition.x, wPosition.y, wPosition.z);
        const direction = wVec.subtract(origin);
        return {
            origin: { x: origin.x, y: origin.y, z: origin.z },
            direction: { x: direction.x, y: direction.y, z: direction.z }
        };
    }

    private static findIntersection(line1: Line3D, line2: Line3D): Position | null {
        const o1 = new Vec3(line1.origin.x, 0, line1.origin.z);
        const d1 = new Vec3(line1.direction.x, 0, line1.direction.z);
        const o2 = new Vec3(line2.origin.x, 0, line2.origin.z);
        const d2 = new Vec3(line2.direction.x, 0, line2.direction.z);

        const denom = d1.x * d2.z - d1.z * d2.x;
        if (Math.abs(denom) < 1e-9) return null;

        const ox = o2.x - o1.x;
        const oz = o2.z - o1.z;
        const t = (ox * d2.z - oz * d2.x) / denom;
        const rawX = o1.x + d1.x * t;
        const rawZ = o1.z + d1.z * t;

        // Clamp intersection distance
        const bot1Pos = new Vec3(line1.origin.x, 0, line1.origin.z);
        const bot2Pos = new Vec3(line2.origin.x, 0, line2.origin.z);
        let finalPos = new Vec3(rawX, 64, rawZ);
        finalPos = this.clampIntersection(bot1Pos, finalPos, 5000);
        finalPos = this.clampIntersection(bot2Pos, finalPos, 5000);

        return { x: finalPos.x, y: Math.max(60, finalPos.y), z: finalPos.z };
    }

    private static pointOnLine(line: Line3D, fraction: number): Vec3 {
        const origin = new Vec3(line.origin.x, line.origin.y, line.origin.z);
        const dir = new Vec3(line.direction.x, line.direction.y, line.direction.z);
        return origin.plus(dir.scaled(fraction));
    }

    private static bestFractionPoint(line: Line3D, target: Vec3, steps: number): Vec3 {
        // sample fraction to minimize distance line->target
        let bestFrac = 0;
        let bestDist = Number.MAX_VALUE;
        for (let i = 0; i <= steps; i++) {
            const frac = i / steps;
            const p = this.pointOnLine(line, frac);
            const dist = p.distanceTo(target);
            if (dist < bestDist) {
                bestDist = dist;
                bestFrac = frac;
            }
        }
        return this.pointOnLine(line, bestFrac);
    }

    // Limit intersection distance from a bot to maxDist
    private static clampIntersection(botPos: Vec3, intersect: Vec3, maxDist: number): Vec3 {
        const dist = botPos.distanceTo(intersect);
        if (dist > maxDist) {
            const direction = intersect.subtract(botPos).normalize();
            return botPos.plus(direction.scaled(maxDist));
        }
        return intersect;
    }

    private static getAngleBetweenLines(d1: Position, d2: Position): number {
        const v1 = new Vec3(d1.x, 0, d1.z);
        const v2 = new Vec3(d2.x, 0, d2.z);
        const dot = v1.dot(v2);
        const mag1 = v1.distanceTo(new Vec3(0,0,0));
        const mag2 = v2.distanceTo(new Vec3(0,0,0));
        return (mag1 === 0 || mag2 === 0) ? 0 : Math.acos(dot / (mag1 * mag2));
    }

    private static applyMinY(pos: Vec3, minY: number): Vec3 {
        return new Vec3(pos.x, Math.max(minY, pos.y), pos.z);
    }
}