import { SlashCommandBuilder } from 'discord.js';
import { lookupArtist } from '../services/artists';
import type { Command } from '../types/command';
import { artistProfileEmbed } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';

export const artist: Command = {
  data: new SlashCommandBuilder()
    .setName('artist')
    .setDescription('Look up an artist portrait, genre, and years')
    .addStringOption((option) =>
      option
        .setName('artistname')
        .setDescription('The artist to look up')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(80),
    ),

  async execute(ctx) {
    const artistName = ctx.getString('artistname', true);
    if (!artistName) {
      throw new UserFacingError(UserMessages.missingArtist);
    }
    await ctx.deferReply();

    const profile = await lookupArtist(artistName);

    if (!profile) {
      throw new UserFacingError(UserMessages.artistNotFound);
    }

    await ctx.editReply({
      embeds: [artistProfileEmbed(profile)],
    });
  },
};
