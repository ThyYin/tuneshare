import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/command';

export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is online'),

  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
