import { Client, Events } from 'discord.js';
import { logger } from '../utils/logger';

export function registerReadyEvent(client: Client): void {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}`);
  });
}
