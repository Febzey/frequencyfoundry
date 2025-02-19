import Listener from "./listener";
import EventEmitter from "events";
import SoundWaveForge from "./theForge";
import { database, discord } from "./index";
import type { Soundwave } from "./types";
import "dotenv/config";
import { time } from "discord.js";
import { Observation, triangulateEventLinear } from "./cracking/triangulation";
import { computeRelativeCoords } from "./cracking/test_build_data";

/**
 * The frequency foundry, all the listeners are created and will listen here.
 */

const users = process.env.accounts!.split(",");
const userAmt = process.env.acc_amt == null ? users.length : parseInt(process.env.acc_amt);
users.splice(userAmt);

export default class Foundry extends EventEmitter {
  /**
   * Our last three soundwaves. Clear after three. and on three we perform calculations.
   */
  private soundCache = new Map<number, Soundwave>();

  private soundListeners: Map<number, Listener> = new Map();
  private listenerUserNames: { acc: number; email: string | undefined }[] = users.map((user, index) => ({ acc: index + 1, email: user }));

  private preppingForSoundwave = false;

  constructor() {
    super();
  }

  public initialize(): void {
    this.startListeners();
  }

  private async startListeners(): Promise<void> {
    for (let i = 0; i < this.listenerUserNames.length; i++) {
      const listener = new Listener(this.listenerUserNames[i].email as string);

      listener.on("soundwave", async (wave) => {
        this.soundCache.set(this.listenerUserNames[i].acc, wave);

        if (this.soundCache.size === this.soundListeners.size) {
          await this.performCalculations();
          this.soundCache.clear();
        }
      });

      listener.bot.once('spawn', () => {
        this.soundListeners.set(this.listenerUserNames[i].acc, listener);
      })

      await new Promise((r) => setTimeout(r, 5500));
    }
  }

  private async performCalculations(): Promise<void> {
    
    const observations:Observation[] = [];
    this.soundCache.forEach((wave) => {
  
      observations.push({
        playerX: wave.bPosition.x,
        playerZ: wave.bPosition.z,
        relX: wave.wPosition.x,
        relZ: wave.wPosition.z
      });
    });

    const pos = triangulateEventLinear(observations)
    if (!pos) {
      console.log("No intersection found.");
      return;
    }

    console.log(pos)
    database.logSpawn({x: pos.estimatedX, y: 0, z: pos.estimatedZ});
    discord.sendCoordinatesEmbed(
      process.env.channel as string,
      "yellow",
      { x: Math.floor(pos.estimatedX), y: Math.floor(0), z: Math.floor(pos.estimatedZ) },
      "Wither Spawn",
      process.env.mc_server as string,
      `
            A wither has just spawned! \n
            If you are using the mod. copy and paste:       
            `
    );
  }
}
