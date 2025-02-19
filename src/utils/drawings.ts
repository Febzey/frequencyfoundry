import fs from 'fs';

const coords: { x: number, z: number }[] = [];

export function checkOuterSquareFile() {
    const content = fs.readFileSync("./outerSquare.txt", "utf8");
    const coords = content.trim().split("\n").map(line => {
        const [x, y, z] = line.split(",").map(Number);
        return { x, y, z };
    });
    if (coords.length < 4) {
        console.log("Not enough points to form a square.");
        return;
    }
    // Simple bounding box check or additional logic...
    console.log("outerSquare.txt loaded, total points:", coords.length);
}

export default function drawSquareSvg(data: string, fileNAme: string) {
  //  const data = fs.readFileSync('./outerSquare.txt', 'utf8');
    data.split('\n').forEach(line => {
        const parts = line.trim().split(',');
        if (parts.length === 3) {
            const x = parseInt(parts[0], 10);
            const z = parseInt(parts[2], 10);
            coords.push({
                x, z
            });

        }
    })

    const minX = Math.min(...coords.map(c => c.x));
    const maxZ = Math.max(...coords.map(c => c.z));

    const normalCoords = coords.map(c => ({
        x: c.x - minX,
        z: maxZ - c.z
    }))

    const svgWidth = Math.max(...normalCoords.map(c => c.x)) + 20;
    const svgHeight = Math.max(...normalCoords.map(c => c.z)) + 20;

    let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">\n`;

    normalCoords.forEach(c => {
        svg +=  `<rect x="${c.x}" y="${c.z}" width="2" height="2" fill="yellow" />\n`;
    })

    svg += `</svg>`;
    

    coords.length = 0;

    // save the svg locally ./
    fs.writeFileSync(`./${fileNAme}.svg`, svg, 'utf8');

}