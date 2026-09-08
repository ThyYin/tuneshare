import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { env, requireSupabaseEnv } from './config/env';
import { registerReadyEvent } from './events/ready';
import { registerInteractionCreateEvent } from './events/interactionCreate';
import { registerMessageCreateEvent } from './events/messageCreate';
import { logger } from './utils/logger';

requireSupabaseEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

registerReadyEvent(client);
registerInteractionCreateEvent(client);
registerMessageCreateEvent(client);

client.login(env.discordToken).catch((error: unknown) => {
  logger.error('Failed to log in to Discord:', error);
  process.exit(1);
});
