import mysql from "mysql2/promise";

export default class Database {
    private pool: mysql.Pool;
    constructor() {
        this.pool = mysql.createPool({
            host: process.env.db_host,
            user: process.env.db_user,
            password: process.env.db_password,
            database: "wither_spawns",
            connectionLimit: 10,
        });

        this.pool.on("connection", (connection) => {
            console.log("Connected to database");
        });
    }

    async logSpawn(spawn: { x: number, y: number, z: number }): Promise<void> {
        try {
            const sql = `INSERT INTO wither_logs (mc_server, x, y, z) VALUES (?, ?, ?, ?)`;
            const values = [process.env.mc_server, spawn.x, spawn.y, spawn.z];
            await this.pool.execute(sql, values);
        } catch (error) {
            console.error("Error logging wither spawn:", error);
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

}