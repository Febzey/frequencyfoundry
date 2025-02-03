import Listener from "./listener.js";
import EventEmitter from "events";
import SoundWaveForge from "./theForge.js";
import { database, discord } from "./index.js";


/**
 * The frequency foundry, all the listeners are created and will listen here.
 */
export default class Foundry extends EventEmitter {

    /**
     * Our last two soundwaves. Clear after two. and on two we perform calculations.
     */
    private soundCache = new Map<number, Soundwave>();

    private soundListeners: Map<number, Listener> = new Map();
    private listenerUserNames: { acc: number, email: string | undefined }[] = [
        { acc: 1, email: process.env.account1 },
        { acc: 2, email: process.env.account2 },
        // {acc: 3, email: process.env.account3},
        // {acc: 4, email: process.env.account4},
    ];

    constructor() {
        super();
    }

    public initialize(): void {
        this.startListeners();
    }

    private async startListeners(): Promise<void> {
        for (let i = 0; i < this.listenerUserNames.length; i++) {
            const listener = new Listener(this.listenerUserNames[i].email as string);

            listener.on("soundwave", (wave) => {
                this.soundCache.set(this.listenerUserNames[i].acc, wave);
                console.log(`User: ${wave.user} emitted a soundwave.`);

                if (this.soundCache.size === 2) {
                    console.log("Both listeners have emitted. Performing calculation...");
                    this.performCalculations();
                    this.soundCache.clear();
                }
            });

            this.soundListeners.set(this.listenerUserNames[i].acc, listener);
            await new Promise(r => setTimeout(r, 15000));

        }
    }

    private async performCalculations(): Promise<void> {
        const wave1 = this.soundCache.get(1);
        const wave2 = this.soundCache.get(2);

        if (!wave1 || !wave2) {
            console.error("Could not find both soundwaves.");
            return;
        }

        const { bPosition: { x: x1, y: y1, z: z1 }, wPosition: { x: x2, y: y2, z: z2 } } = wave1;
        const { bPosition: { x: x3, y: y3, z: z3 }, wPosition: { x: x4, y: y4, z: z4 } } = wave2;

        console.log(`${wave1.user} Heard a sound from ${x1}, ${y1}, ${z1} towards ${x2}, ${y2}, ${z2}`);
        console.log(`${wave2.user} Heard a sound from ${x3}, ${y3}, ${z3} towards ${x4}, ${y4}, ${z4}`);

        const pos = SoundWaveForge.calculateIntersectionForTwoLines(wave1.bPosition, wave1.wPosition, wave2.bPosition, wave2.wPosition);
    
        if (!pos) return console.log("No intersection found.");
        database.logSpawn(pos as { x: number, y: number, z: number });
        discord.sendCoordinatesEmbed(process.env.channel as string, "yellow", pos as { x: number, y: number, z: number }, "Wither Spawn", process.env.mc_server as string, "A wither has just spawned!");
    }

}