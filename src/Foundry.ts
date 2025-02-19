import Listener from "./listener.js";
import EventEmitter from "events";
import SoundWaveForge from "./theForge.js";
import { database, discord } from "./index.js";


/**
 * The frequency foundry, all the listeners are created and will listen here.
 */
export default class Foundry extends EventEmitter {

    /**
     * Our last three soundwaves. Clear after three. and on three we perform calculations.
     */
    private soundCache = new Map<number, Soundwave>();

    private soundListeners: Map<number, Listener> = new Map();
    // Now we have 4 accounts total
    private listenerUserNames: { acc: number, email: string | undefined }[] = [
        { acc: 1, email: process.env.account1 },
        { acc: 2, email: process.env.account2 },
        { acc: 3, email: process.env.account3 },
        { acc: 4, email: process.env.account4 }
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
                console.log(`User: ${wave.user} => wave from acc ${this.listenerUserNames[i].acc}`);
                // Wait for 4 waves
                if (this.soundCache.size === 4) {
                    console.log("All 4 listeners have emitted. Performing calculation...");
                    this.performCalculations();
                    this.soundCache.clear();
                }
            });

            this.soundListeners.set(this.listenerUserNames[i].acc, listener);
            await new Promise(r => setTimeout(r, 16000));

        }
    }

    private async performCalculations(): Promise<void> {
        const wave1 = this.soundCache.get(1);
        const wave2 = this.soundCache.get(2);
        const wave3 = this.soundCache.get(3);
        const wave4 = this.soundCache.get(4);
        if (!wave1 || !wave2 || !wave3 || !wave4) return;

        // Pair 1,2 => intersection (i12)
        const i12 = SoundWaveForge.calculateAccurateWitherSpawn(
            wave1.bPosition, wave1.wPosition,
            wave2.bPosition, wave2.wPosition,
            8
        );
        // Pair 3,4 => intersection (i34)
        const i34 = SoundWaveForge.calculateAccurateWitherSpawn(
            wave3.bPosition, wave3.wPosition,
            wave4.bPosition, wave4.wPosition,
            8
        );
        if (!i12 || !i34) {
            console.log("One of the team intersections was null.");
            return;
        }
        // Final intersection from the two intersection points
        const finalPos = SoundWaveForge.calculateFinalIntersection(
            wave1.bPosition, i12,
            wave3.bPosition, i34
        );
        console.log("Final intersection:", finalPos);
        if (!finalPos) return;

        database.logSpawn(finalPos);
        discord.sendCoordinatesEmbed(
            process.env.channel as string,
            "yellow",
            { x: Math.floor(finalPos.x), y: Math.floor(finalPos.y), z: Math.floor(finalPos.z) },
            "Wither Spawn",
            process.env.mc_server as string,
            "4-bot triangulation result"
        );
    }

}