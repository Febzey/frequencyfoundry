import Listener from "./listener";
import EventEmitter from "events";
import SoundWaveForge from "./theForge";
import { database, discord } from "./index";
// import type {Soundwave} from './types'

/**
 * The frequency foundry, all the listeners are created and will listen here.
 */
export default class Foundry extends EventEmitter {

    /**
     * Our last three soundwaves. Clear after three. and on three we perform calculations.
     */
    private soundCache = new Map<number, Soundwave>();

    private soundListeners: Map<number, Listener> = new Map();
    // Now we have 3 accounts total
    private listenerUserNames: { acc: number, email: string | undefined }[] = [
        { acc: 1, email: process.env.account1 },
        { acc: 2, email: process.env.account2 },
        { acc: 3, email: process.env.account3 }
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
                // Wait for 3 waves
                if (this.soundCache.size === 3) {
                    console.log("All 3 listeners have emitted. Performing calculation...");
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
        if (!wave1 || !wave2 || !wave3) return;

        const forgeConfig = {
            clampDistance: parseInt(process.env.FORGE_CLAMP_DIST ?? "5000", 10),
            minY: parseInt(process.env.FORGE_MIN_Y ?? "60", 10),
            viewDistance: parseInt(process.env.FORGE_VIEW_DIST ?? "8", 10)
        };

        const finalPos = SoundWaveForge.triangulateEventLinear(
            wave1.bPosition, wave1.wPosition,
            wave2.bPosition, wave2.wPosition,
            wave3.bPosition, wave3.wPosition,
            forgeConfig
        );
        if (!finalPos) {
            console.log("Could not triangulate the event linearly.");
            return;
        }
        console.log("Triangulated position:", finalPos);
        database.logSpawn(finalPos);
        discord.sendCoordinatesEmbed(
            process.env.channel as string,
            "blue",
            { x: Math.floor(finalPos.x), y: Math.floor(finalPos.y), z: Math.floor(finalPos.z) },
            "Wither Spawn (3-bot linear triangulation)",
            process.env.mc_server as string,
            "3-bot triangulation result"
        );
    }

    // private getQuadrant(x: number, z: number): number {
    //     if (x >= 0 && z >= 0) return 1;
    //     if (x < 0 && z >= 0) return 2;
    //     if (x < 0 && z < 0) return 3;
    //     return 4; 
    // }

}