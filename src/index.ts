import Database from "./database";
import Foundry from "./Foundry";
import Discord from "./discord";
import "dotenv/config"

const discord = new Discord();
const foundry = new Foundry();
const database = new Database();

discord.start();
foundry.initialize();
export { foundry, database, discord }
