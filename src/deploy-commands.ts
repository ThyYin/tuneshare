import { REST, Routes } from 'discord.js';
import { env } from './config/env';
import { commands } from './commands';

const rest = new REST({ version: '10' }).setToken(env.discordToken);

async function deployCommands(): Promise<void> {
  const body = commands.map((command) => command.data.toJSON());

  await rest.put(Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId), {
    body,
  });

  console.log(`Successfully registered ${body.length} guild command(s).`);
}

deployCommands().catch((error: unknown) => {
  console.error('Failed to register slash commands:', error);
  process.exit(1);
});
