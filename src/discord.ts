import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';
export default class Discord {
    private client: Client;
   // private storageHandler: StorageHandler = new StorageHandler();

    constructor() {
        // Initialize the Discord client with necessary intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds, // Needed to interact with guilds
                GatewayIntentBits.GuildMessages, // Needed to send messages
            ],
        });


        // Register event listeners
        this.setupEventListeners();
    }

    // Logs in to Discord
    public async start() {
        const token = process.env.token;
        if (!token) {
            console.error('DISCORD_TOKEN is not set in the environment variables!');
            return;
        }

        try {
            await this.client.login(token);
            console.log('Bot logged in successfully!');
        } catch (error) {
            console.error('Failed to log in:', error);
        }
    }

    // Fetches a specific channel and sends a message
    public async sendMessageToChannel(channelId: string, message: string) {
        try {
            const channel = await this.client.channels.fetch(channelId);

            if (channel?.isTextBased()) {
                const textChannel = channel as TextChannel;
                await textChannel.send(message);
                console.log(`Message sent to channel ${channelId}`);
            } else {
                console.error(`Channel with ID ${channelId} is not a text channel!`);
            }
        } catch (error) {
            console.error(`Failed to send message to channel ${channelId}:`, error);
        }
    }

    public async sendCoordinatesEmbed(
        channelId: string,
        color: string,
        coordinates: { x: number; y: number; z: number },
        title: string,
        serverName: string,
        description?: string,
    ) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel?.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(this.getEmbedColor(color))
                    .setTitle(title)
                    .setDescription(description || '')
                    .addFields(
                        { name: 'Coordinates', value: `🅧: ${Math.round(coordinates.x)} | 🅨: ${Math.round(coordinates.y)} | 🅩: ${Math.round(coordinates.z)}`, inline: false },
                        { name: 'Server', value: serverName, inline: false },
                        { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setFooter({ text: `Coordinates display` });
                await (channel as TextChannel).send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(`Failed to send embed to channel ${channelId}:`, error);
        }
    }

    // Sets up event listeners for the bot
    private setupEventListeners() {
        this.client.on('ready', () => {
            console.log(`Logged in as ${this.client.user?.tag}`);
        });

        this.client.on('error', (error) => {
            console.error('Client error:', error);
        });

    }

    private getEmbedColor(color: string): number {
        switch (color.toLowerCase()) {
            case 'red': return 0xFF0000;
            case 'green': return 0x00FF00;
            case 'yellow': return 0xFFFF00;
            default: return 0x00FFFF; // Default to cyan
        }
    }

}