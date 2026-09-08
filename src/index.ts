import { Client, GatewayIntentBits } from 'discord.js';
import { env } from './config/env';
import { registerReadyEvent } from './events/ready';
import { registerInteractionCreateEvent } from './events/interactionCreate';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

registerReadyEvent(client);
registerInteractionCreateEvent(client);

client.login(env.discordToken).catch((error: unknown) => {
  console.error('Failed to log in to Discord:', error);
  process.exit(1);
});
