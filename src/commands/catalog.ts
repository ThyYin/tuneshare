import { SlashCommandBuilder } from 'discord.js';
import { searchCatalogueArtistsOrThrow } from '../services/music/artistCatalogue';
import type { Command } from '../types/command';
import { buildArtistSearchMessage } from '../utils/artistSearchMessage';
import { UserFacingError, UserMessages } from '../utils/errors';

export const catalog: Command = {
  data: new SlashCommandBuilder()
    .setName('catalog')
    .setDescription("Browse an artist's albums and songs")
    .addStringOption((option) =>
      option
        .setName('artistname')
        .setDescription('The artist whose catalogue to browse')
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

    const results = await searchCatalogueArtistsOrThrow(artistName);
    await ctx.editReply(
      buildArtistSearchMessage({
        action: 'cat',
        userId: ctx.user.id,
        query: artistName,
        results,
      }),
    );
  },
};
