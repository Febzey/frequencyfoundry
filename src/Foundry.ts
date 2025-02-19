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
    private listenerUserNames: { acc: number, email: string | undefined }[] = [
        { acc: 1, email: process.env.account1 },
        { acc: 3, email: process.env.account3 } ,// only two now
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
            await new Promise(r => setTimeout(r, 16000));

        }
    }

    private async performCalculations(): Promise<void> {
        const wave1 = this.soundCache.get(1);
        const wave3 = this.soundCache.get(3);

        if (!wave1 || !wave3) {
            console.error("Could not find both soundwaves.");
            return;
        }

        console.log(`(1) ${wave1.user} => bPos(${wave1.bPosition.x},${wave1.bPosition.y},${wave1.bPosition.z}) wPos(${wave1.wPosition.x},${wave1.wPosition.y},${wave1.wPosition.z})`);
        console.log(`(3) ${wave3.user} => bPos(${wave3.bPosition.x},${wave3.bPosition.y},${wave3.bPosition.z}) wPos(${wave3.wPosition.x},${wave3.wPosition.y},${wave3.wPosition.z})`);

        const pos = SoundWaveForge.calculateAccurateWitherSpawn(
            wave1.bPosition, wave1.wPosition,
            wave3.bPosition, wave3.wPosition,
            8
        );

    
        console.log("Intersection:", pos);

        if (!pos) {
            console.log("No intersection found.");
            return;
        }

        database.logSpawn(pos);
        discord.sendCoordinatesEmbed(
            process.env.channel as string,
            "yellow",
            { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
            "Wither Spawn",
            process.env.mc_server as string,
            `
            A wither has just spawned! \n
            If you are using the mod. copy and paste:
            \`\`\`
.drawline ${wave1.bPosition.x} ${wave1.bPosition.z} ${wave1.wPosition.x} ${wave1.wPosition.z}
&
.drawline ${wave3.bPosition.x} ${wave3.bPosition.z} ${wave3.wPosition.x} ${wave3.wPosition.z}
            \`\`\`            
            `
        );
    }

}