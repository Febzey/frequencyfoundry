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
    private listenerUserNames: { acc: number, email: string | undefined }[] = [
        { acc: 1, email: process.env.account1 },
        { acc: 2, email: process.env.account2 },
        { acc: 3, email: process.env.account3 },
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

                if (this.soundCache.size === 3) {
                    console.log("All three listeners have emitted. Performing calculation...");
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

        if (!wave1 || !wave2 || !wave3) {
            console.error("Could not find all soundwaves.");
            return;
        }

        console.log(`${wave1.user} => bPos(${wave1.bPosition.x},${wave1.bPosition.y},${wave1.bPosition.z}) wPos(${wave1.wPosition.x},${wave1.wPosition.y},${wave1.wPosition.z})`);
        console.log(`${wave2.user} => bPos(${wave2.bPosition.x},${wave2.bPosition.y},${wave2.bPosition.z}) wPos(${wave2.wPosition.x},${wave2.wPosition.y},${wave2.wPosition.z})`);
        console.log(`${wave3.user} => bPos(${wave3.bPosition.x},${wave3.bPosition.y},${wave3.bPosition.z}) wPos(${wave3.wPosition.x},${wave3.wPosition.y},${wave3.wPosition.z})`);

        const pos = SoundWaveForge.calculateIntersectionForThreeLinesRefined(
            wave1.bPosition, wave1.wPosition,
            wave2.bPosition, wave2.wPosition,
            wave3.bPosition, wave3.wPosition
        );

        if (!pos) {
            console.log("No intersection found.");
            return;
        }
        database.logSpawn(pos);
        discord.sendCoordinatesEmbed(
            process.env.channel as string,
            "yellow",
            pos,
            "Wither Spawn",
            process.env.mc_server as string,
            "A wither has just spawned!"
        );
    }

}