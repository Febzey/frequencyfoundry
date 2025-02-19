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
        // Create lines from each bot to its raw sound position
        const line1 = this.calculateLine(bot1Pos, bot1SoundPos);
        const line2 = this.calculateLine(bot2Pos, bot2SoundPos);

        // Find intersection
        const intersection = this.findIntersection(line1, line2);
        if (!intersection) return null;

        // Compute angle between directions
        const angle = this.getAngleBetweenLines(line1.direction, line2.direction);
        // Error grows as angle gets smaller
        const error = angle < 0.0001 ? Infinity : 1 / Math.sin(angle);

        return { ...intersection, error };
    }

    private static calculateLine(bPosition: Position, wPosition: Position): Line3D {
        return {
            origin: bPosition,
            direction: {
                x: wPosition.x - bPosition.x,
                y: wPosition.y - bPosition.y,
                z: wPosition.z - bPosition.z
            }
        };
    }

    private static findIntersection(line1: Line3D, line2: Line3D): Position | null {
        // Only compute x,z to keep it 2D
        const { x: x1, z: z1 } = line1.origin;
        const { x: dx1, z: dz1 } = line1.direction;
        const { x: x2, z: z2 } = line2.origin;
        const { x: dx2, z: dz2 } = line2.direction;

        const denom = dx1 * dz2 - dz1 * dx2;
        if (denom === 0) return null; // parallel

        const t = ((x2 - x1) * dz2 - (z2 - z1) * dx2) / denom;
        return {
            x: x1 + t * dx1,
            y: 64,
            z: z1 + t * dz1
        };
    }

    private static getAngleBetweenLines(d1: Position, d2: Position): number {
        const dot = d1.x * d2.x + d1.z * d2.z;
        const mag1 = Math.hypot(d1.x, d1.z);
        const mag2 = Math.hypot(d2.x, d2.z);
        if (mag1 === 0 || mag2 === 0) return 0;
        return Math.acos(dot / (mag1 * mag2));
    }
}