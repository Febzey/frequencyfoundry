import Database from "./database.js";
import Foundry from "./Foundry.js";
import Discord from "./discord.js";
import "dotenv/config"

const discord = new Discord();
const foundry = new Foundry();
const database = new Database();

discord.start();
foundry.initialize();
export { foundry, database, discord }
