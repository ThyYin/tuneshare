import { SlashCommandBuilder } from 'discord.js';
import { MAX_SONG_URL_LENGTH } from '../constants';
import { addFavourite } from '../services/favourites';
import { hydrateSong, parseMusicUrl } from '../services/music';
import type { Command } from '../types/command';
import { addedFavouriteEmbed } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';

export const fav: Command = {
  data: new SlashCommandBuilder()
    .setName('fav')
    .setDescription('Save a Spotify or YouTube Music song to your favourites')
    .addStringOption((option) =>
      option
        .setName('song_url')
        .setDescription('A Spotify or YouTube Music song link')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(MAX_SONG_URL_LENGTH),
    ),

  async execute(ctx) {
    const songUrl = ctx.getString('song_url', true);
    if (!songUrl) {
      throw new UserFacingError(UserMessages.missingSongUrl);
    }
    const parsed = parseMusicUrl(songUrl);

    await ctx.deferReply();
    const resolved = await hydrateSong(parsed);
    const favourite = await addFavourite({
      discordUserId: ctx.user.id,
      songTitle: resolved.title,
      artist: resolved.artist,
      album: resolved.album,
      platform: resolved.platform,
      platformSongId: resolved.platformSongId,
      url: resolved.canonicalUrl,
      thumbnailUrl: resolved.thumbnailUrl,
    });

    await ctx.editReply({
      embeds: [addedFavouriteEmbed(favourite, resolved.metadataMissing)],
    });
  },
};
