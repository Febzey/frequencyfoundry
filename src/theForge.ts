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

    private static findBestIntersection(lines: Line3D[]): Position {
        const A: number[][] = [];
        const b: number[] = [];
        // Build A and b
        for (const { origin, direction } of lines) {
            const nx = direction.z;
            const nz = -direction.x;
            A.push([nx, nz]);
            b.push(nx * origin.x + nz * origin.z);
        }
        // Compute AᵀA and Aᵀb
        const a11 = A.reduce((sum, row) => sum + row[0] * row[0], 0);
        const a12 = A.reduce((sum, row) => sum + row[0] * row[1], 0);
        const a22 = A.reduce((sum, row) => sum + row[1] * row[1], 0);
        const b1 = A.reduce((sum, row, i) => sum + row[0] * b[i], 0);
        const b2 = A.reduce((sum, row, i) => sum + row[1] * b[i], 0);
        const det = a11 * a22 - a12 * a12;
        if (Math.abs(det) < 1e-9) {
            return { x: 0, y: 0, z: 0 };
        }
        // Invert and solve for X
        const invA11 = a22 / det;
        const invA12 = -a12 / det;
        const invA22 = a11 / det;
        const x = invA11 * b1 + invA12 * b2;
        const z = invA12 * b1 + invA22 * b2;
        return { x, y: 0, z };
    }

    static calculateIntersectionForTwoLines(bPos1: Position, wPos1: Position, bPos2: Position, wPos2: Position): Position | null {
        const line1 = this.calculateLine(bPos1, wPos1);
        const line2 = this.calculateLine(bPos2, wPos2);
        return this.findIntersection(line1, line2);
    }

    static calculateIntersectionForThreeLinesRefined(
        bPos1: Position, wPos1: Position,
        bPos2: Position, wPos2: Position,
        bPos3: Position, wPos3: Position
    ): Position | null {
        // Build lines first
        const L1 = this.calculateLine(bPos1, wPos1);
        const L2 = this.calculateLine(bPos2, wPos2);
        const L3 = this.calculateLine(bPos3, wPos3);

        // Use the new helper
        return this.findBestIntersection([L1, L2, L3]);
    }

    private static isOnAnyLine(pos: Position, lines: Line3D[], tolerance = 0.001): boolean {
        return lines.some((ln) => this.isPointOnLine2D(pos, ln, tolerance));
    }

    private static isPointOnLine2D(point: Position, line: Line3D, tolerance: number): boolean {
        const { x: x1, z: z1 } = line.origin;
        const { x: dx, z: dz } = line.direction;
        const { x, z } = point;

        const t = (x - x1) / dx;
        const expectedZ = z1 + t * dz;

        return Math.abs(z - expectedZ) <= tolerance;
    }
}