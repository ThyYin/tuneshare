import { REST, Routes } from 'discord.js';
import { env } from './config/env';
import { commands } from './commands';
import { logger } from './utils/logger';

const rest = new REST({ version: '10' }).setToken(env.discordToken);

async function deployCommands(): Promise<void> {
  const body = commands.map((command) => command.data.toJSON());

  await rest.put(Routes.applicationCommands(env.discordClientId), { body });
  logger.info(
    `Successfully registered ${body.length} global command(s). They can take up to an hour to show in every server.`,
  );
}

deployCommands().catch((error: unknown) => {
  logger.error('Failed to register slash commands:', error);
  process.exit(1);
});
