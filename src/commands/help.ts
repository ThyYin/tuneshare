import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/command';
import { helpEmbed } from '../utils/embeds';

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show every Tunetopia command and how to use it'),

  async execute(ctx) {
    const { commands } = await import('./index');

    await ctx.reply({
      embeds: [helpEmbed([...commands.values()])],
    });
  },
};
