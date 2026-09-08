import { Client, Events } from 'discord.js';
import { commands } from '../commands';

export function registerInteractionCreateEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commands.get(interaction.commandName);

    if (!command) {
      console.warn(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing /${interaction.commandName}:`, error);

      const errorReply = {
        content: '❌ Something went wrong while running that command. Please try again later.',
        ephemeral: true as const,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply);
      } else {
        await interaction.reply(errorReply);
      }
    }
  });
}
