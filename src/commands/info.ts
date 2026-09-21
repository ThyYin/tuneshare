import { SlashCommandBuilder } from 'discord.js';
import { MAX_SONG_URL_LENGTH } from '../constants';
import { fetchSongInfo, looksLikeMusicUrl, parseMusicUrl } from '../services/music';
import { searchSongsOrThrow } from '../services/music/search';
import type { Command } from '../types/command';
import { songInfoEmbed } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';
import { buildSongSearchMessage } from '../utils/songSearchMessage';

export const song: Command = {
  data: new SlashCommandBuilder()
    .setName('song')
    .setDescription('Show cover art, title, artist, year, and listener stats for a song')
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
      const details = await fetchSongInfo(parseMusicUrl(input));
      await ctx.editReply({
        embeds: [songInfoEmbed(details)],
      });
      return;
    }

    const results = await searchSongsOrThrow(input);
    await ctx.editReply(
      buildSongSearchMessage({
        action: 'info',
        userId: ctx.user.id,
        query: input,
        results,
      }),
    );
  },
};
