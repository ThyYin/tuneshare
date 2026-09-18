import { SlashCommandBuilder } from 'discord.js';
import { searchCatalogueAlbumsOrThrow } from '../services/music/artistCatalogue';
import type { Command } from '../types/command';
import { buildAlbumSearchMessage } from '../utils/albumSearchMessage';
import { UserFacingError, UserMessages } from '../utils/errors';

export const album: Command = {
  data: new SlashCommandBuilder()
    .setName('album')
    .setDescription('Look up an album and see its tracks')
    .addStringOption((option) =>
      option
        .setName('album')
        .setDescription('The album to look up')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(80),
    ),

  async execute(ctx) {
    const albumName = ctx.getString('album', true);
    if (!albumName) {
      throw new UserFacingError(UserMessages.missingAlbumQuery);
    }
    await ctx.deferReply();

    const results = await searchCatalogueAlbumsOrThrow(albumName);
    await ctx.editReply(
      buildAlbumSearchMessage({
        action: 'info',
        userId: ctx.user.id,
        query: albumName,
        results,
      }),
    );
  },
};
