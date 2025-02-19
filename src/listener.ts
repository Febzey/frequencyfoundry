import { createBot, BotOptions, Bot } from "mineflayer";
import EventEmitter from "events";
import { Vec3 } from "vec3";
import type { Soundwave } from "./types";

const effectIds = [
  { id: 1023, name: "wither_spawned" },
  { id: 1028, name: "ender_dragon_death" },
  { id: 1038, name: "end_portal_opened" },
];

class Listener extends EventEmitter {
  public bot: Bot;
  private email: string;

  constructor(email: string) {
    super();
    this.email = email;
    this.bot = this.start();
    this.bot.on("error", this.onError);
    this.bot.on("kicked", this.onKick);
    this.bot.on("end", this.onEnd);
    this.bot.on("spawn", async () => {
      //   this.bot.chat("/kill");
      //   this.bot.chat("/suicide");

      const radius = 20_000_000;
      const randX = Math.floor(Math.random() * radius);
      const randZ = Math.floor(Math.random() * radius);
      const x = Math.random() > 0.5 ? -randX : randX
      const z = Math.random() > 0.5 ? -randZ : randZ
      this.bot.chat("/gamemode creative");
      await this.bot.waitForTicks(5);
      // this.bot.chat(`/tp ${this.bot.username} ${x}.0 ~ ${z}.0`);
    });
    this.bot._client.on("packet", this.onClientPacket);
    this.bot.on("login", () => {
      console.log(`${this.bot.username} has logged in.`);
    });
  }

  // // Helper: projects raw sound vector from bot's center to the effective render edge.
  // private getCandidatePoint(raw: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  //     const botPos = this.bot.entity.position;
  //     const centerX = botPos.x;
  //     const centerY = botPos.y;
  //     const centerZ = botPos.z;
  //     const dx = raw.x - centerX;
  //     const dz = raw.z - centerZ;
  //     const angle = Math.atan2(dz, dx);
  //     const viewDistanceChunks = this.bot.settings.viewDistance as number;
  //     const effectiveDistance = viewDistanceChunks * 16;
  //     return {
  //         x: Math.floor(centerX + effectiveDistance * Math.cos(angle)),
  //         y: centerY,
  //         z: Math.floor(centerZ + effectiveDistance * Math.sin(angle))
  //     };
  // }

  public start(): Bot {
    this.bot = createBot({
      host: process.env.host,
      port: Number(process.env.port),
      username: this.email,
      // auth: "microsoft",
      version: process.env.version,
      viewDistance: "far",
      respawn: process.env.respawn === "true",
    });
    this.bot.on("soundEffectHeard", (soundName, position) => {
      console.log(position, soundName);
    });
    return this.bot;
  }

  private onClientPacket = (data: any, meta: any) => {
    // if (meta.name === "sound_effect") {
    //   console.log(data, meta);
    // }
    if (meta.name === "world_event") {
      const id = data.effectId;
      const effect = effectIds.find((e) => e.id === id);
      if (effect && effect.name === "wither_spawned") {
        const { x, y, z } = data.location;
        const wave: Soundwave = {
          user: this.bot.username,
          bPosition: this.bot.entity.position.clone(),
          wPosition: new Vec3(x, y, z),
        };

        this.emit("soundwave", wave);
      }
    }
  };

  private onError = (err: Error) => {
    console.log(err, ` error in ${this.email}`);
  };

  private onKick = (reason: string) => {
    console.log(reason, ` kicked in ${this.email}`);
  };
  private onEnd = () => {
    console.log(`Disconnected from ${this.email}`);
  };
}

declare interface Listener {
  emit(event: "soundwave", wave: Soundwave): boolean;
  on(event: "soundwave", listener: (wave: Soundwave) => void): this;
}

export default Listener;
