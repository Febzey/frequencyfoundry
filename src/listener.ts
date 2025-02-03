import { createBot, BotOptions, Bot } from "mineflayer";
import EventEmitter from "events";

const effectIds = [
    { id: 1023, name: "wither_spawned" },
    { id: 1028, name: "ender_dragon_death" },
    { id: 1038, name: "end_portal_opened" }
]

interface Soundwave {
    user: string
    bPosition: { x: number; y: number; z: number };
    wPosition: { x: number; y: number; z: number };
}

class Listener extends EventEmitter {

    private bot: Bot;
    private email: string

    constructor(email: string) {
        super();
        this.email = email;
        this.bot = this.start();
        // this.bot.on("chat", this.onSpawn);
        this.bot.on("error", this.onError);
        this.bot.on("kicked", this.onKick);
        this.bot.on("end", this.onEnd);
        this.bot.on("spawn", () => { 
            this.bot.chat("/kill")
            this.bot.chat("/suicide")
        })

        this.bot.on("entitySpawn", (entity) => { 
            if (entity.type !== "player") return;
            if (entity.username === this.bot.username) return;

        })

        // The juicy stuff
        this.bot._client.on("packet", this.onClientPacket);
        this.bot.on("login", () => {
            console.log(`${this.bot.username} has logged in.`)
        })
        // I <3 packets
    }

    public start(): Bot {
        this.bot = createBot({
            host: process.env.host,
            port: 25565,
            username: this.email,
            auth: "microsoft",
            version: process.env.version,
            respawn: false
        });

        return this.bot
    }

    private onClientPacket = (data: any, meta: any) => {
        //  console.log(data, meta);

        if (meta.name === "world_event") {
            const id = data.effectId;
            const effect = effectIds.find(e => e.id === id);
            if (effect) {
                if (effect?.name === "wither_spawned") {
                    const { x, y, z } = data.location;
                    const wave: Soundwave = {
                        user: this.bot.username,
                        bPosition: { x: this.bot.entity.position.x, y: this.bot.entity.position.y, z: this.bot.entity.position.z },
                        wPosition: { x, y, z }
                    };

                    this.emit("soundwave", wave);

                }
            }
        }
    }

    private onError = (err: Error) => {
        console.log(err, ` error in ${this.email}`);
    }

    private onKick = (reason: string) => {
        console.log(reason, ` kicked in ${this.email}`);
    }
    private onEnd = () => { console.log(`Disconnected from ${this.email}`); }
}

declare interface Listener {
    emit(event: 'soundwave', wave: Soundwave): boolean;
    on(event: 'soundwave', listener: (wave: Soundwave) => void): this;
}

export default Listener