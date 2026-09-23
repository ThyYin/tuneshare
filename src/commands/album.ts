import { SlashCommandBuilder } from 'discord.js';
import { MAX_SONG_URL_LENGTH } from '../constants';
import { looksLikeAlbumInput, resolveAlbumFromUrl } from '../services/music/albumUrl';
import { getAlbumTracks, searchCatalogueAlbumsOrThrow } from '../services/music/artistCatalogue';
import type { Command } from '../types/command';
import { buildAlbumSearchMessage } from '../utils/albumSearchMessage';
import { buildAlbumLookupTracksMessage } from '../utils/artistCatalogueMessage';
import { UserFacingError, UserMessages } from '../utils/errors';

export const album: Command = {
  data: new SlashCommandBuilder()
    .setName('album')
    .setDescription('Look up an album and see its tracks')
    .addStringOption((option) =>
      option
        .setName('album')
        .setDescription('An album name, or a Spotify, YouTube Music, Deezer, or SoundCloud link')
        .setRequired(true)
        .setMaxLength(MAX_SONG_URL_LENGTH),
    ),

  async execute(ctx) {
    const albumName = ctx.getString('album', true);
    if (!albumName) {
      throw new UserFacingError(UserMessages.missingAlbumQuery);
    }
    await ctx.deferReply();

    if (looksLikeAlbumInput(albumName)) {
      const hit = await resolveAlbumFromUrl(albumName);
      const tracks = await getAlbumTracks(hit.source, hit.artistId, hit.albumId, 1);
      if (!tracks) {
        throw new UserFacingError(UserMessages.albumLinkFailed);
      }

      await ctx.editReply(
        buildAlbumLookupTracksMessage({
          userId: ctx.user.id,
          tracks,
        }),
      );
      return;
    }

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
