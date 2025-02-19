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

export default class SoundWaveForge {

    static calculateAccurateWitherSpawn(
        bot1Pos: Position, bot1SoundPos: Position,
        bot2Pos: Position, bot2SoundPos: Position,
        viewDistance: number
    ): { x: number; y: number; z: number; error: number } | null {
        const line1 = this.calculateLine(bot1Pos, bot1SoundPos);
        const line2 = this.calculateLine(bot2Pos, bot2SoundPos);
        const intersection = this.findIntersection(line1, line2);
        if (!intersection) return null;
        const angle = this.getAngleBetweenLines(line1.direction, line2.direction);
        const error = angle < 0.0001 ? Infinity : 1 / Math.sin(angle);
        return { ...intersection, error };
    }

    static calculateFinalIntersection(
        botPosA: Position, i12: Position,
        botPosB: Position, i34: Position
    ): Position | null {
        const lineA = this.calculateLine(botPosA, i12);
        const lineB = this.calculateLine(botPosB, i34);
        return this.findIntersection(lineA, lineB);
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

        return {
            x: o1.x + d1.x * t,
            y: 64,
            z: o1.z + d1.z * t
        };
    }

    private static getAngleBetweenLines(d1: Position, d2: Position): number {
        const v1 = new Vec3(d1.x, 0, d1.z);
        const v2 = new Vec3(d2.x, 0, d2.z);
        const dot = v1.dot(v2);
        const mag1 = v1.distanceTo(new Vec3(0,0,0));
        const mag2 = v2.distanceTo(new Vec3(0,0,0));
        return (mag1 === 0 || mag2 === 0) ? 0 : Math.acos(dot / (mag1 * mag2));
    }
}