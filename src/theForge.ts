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


    private static calculateLine(bPosition: Position, wPosition: Position): Line3D {
        return {
            origin: bPosition,
            direction: {
                x: wPosition.x - bPosition.x,
                y: wPosition.y - bPosition.y,
                z: wPosition.z - bPosition.z
            }
        };
    };

    private static findIntersection(line1: Line3D, line2: Line3D): Position | null {
        const { x: x1, z: z1 } = line1.origin;
        const { x: dx1, z: dz1 } = line1.direction;
        const { x: x2, z: z2 } = line2.origin;
        const { x: dx2, z: dz2 } = line2.direction;

        const denom = dx1 * dz2 - dz1 * dx2;
        if (denom === 0) {
            return null; // parallel or coincident
        }
        const t = ((x2 - x1) * dz2 - (z2 - z1) * dx2) / denom;
        return {
            x: x1 + t * dx1,
            y: 0,
            z: z1 + t * dz1
        };
    }

    static calculateIntersectionForTwoLines(bPos1: Position, wPos1: Position, bPos2: Position, wPos2: Position): Position | null {
        const line1 = this.calculateLine(bPos1, wPos1);
        const line2 = this.calculateLine(bPos2, wPos2);
        return this.findIntersection(line1, line2);
    }
}