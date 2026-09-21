import { SlashCommandBuilder } from 'discord.js';
import { MAX_SONG_URL_LENGTH } from '../constants';
import { addFavourite } from '../services/favourites';
import { hydrateSong, looksLikeMusicUrl, parseMusicUrl, parsedSongFromParts } from '../services/music';
import { searchSongsOrThrow } from '../services/music/search';
import type { ParsedSongUrl } from '../services/music/types';
import type { Favourite } from '../types/favourite';
import type { Command } from '../types/command';
import { addedFavouriteEmbed } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';
import { buildSongSearchMessage } from '../utils/songSearchMessage';

export const fav: Command = {
  data: new SlashCommandBuilder()
    .setName('fav')
    .setDescription('Save a song to your favourites by name or link')
    .addStringOption((option) =>
      option
        .setName('song')
        .setDescription('A song name, or a Spotify / YouTube Music / SoundCloud link')
        .setRequired(true)
        .setMaxLength(MAX_SONG_URL_LENGTH),
    ),

  async execute(ctx) {
    const input = ctx.getString('song', true);
    if (!input) {
      throw new UserFacingError(UserMessages.missingSongQuery);
    }

    await ctx.deferReply();

    if (looksLikeMusicUrl(input)) {
      const result = await saveParsedSong(ctx.user.id, parseMusicUrl(input));
      await ctx.editReply({
        embeds: [addedFavouriteEmbed(result.favourite, result.metadataMissing)],
      });
      return;
    }

    const results = await searchSongsOrThrow(input);
    await ctx.editReply(
      buildSongSearchMessage({
        action: 'fav',
        userId: ctx.user.id,
        query: input,
        results,
      }),
    );
  },
};

export async function saveParsedSong(
  discordUserId: string,
  parsed: ParsedSongUrl,
): Promise<{ favourite: Favourite; metadataMissing: boolean }> {
  const resolved = await hydrateSong(parsed);
  const favourite = await addFavourite({
    discordUserId,
    songTitle: resolved.title,
    artist: resolved.artist,
    album: resolved.album,
    platform: resolved.platform,
    platformSongId: resolved.platformSongId,
    url: resolved.canonicalUrl,
    thumbnailUrl: resolved.thumbnailUrl,
  });

  return { favourite, metadataMissing: resolved.metadataMissing };
}

export async function saveSongFromPick(
  discordUserId: string,
  platform: ParsedSongUrl['platform'],
  platformSongId: string,
): Promise<{ favourite: Favourite; metadataMissing: boolean }> {
  return saveParsedSong(discordUserId, parsedSongFromParts(platform, platformSongId));
}
