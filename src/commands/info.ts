import { SlashCommandBuilder } from 'discord.js';
import { MAX_SONG_URL_LENGTH } from '../constants';
import { fetchSongInfo, parseMusicUrl } from '../services/music';
import type { Command } from '../types/command';
import { songInfoEmbed } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';

export const info: Command = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show cover art, title, artist, year, and listener stats for a song')
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
    const info = await fetchSongInfo(parsed);

    await ctx.editReply({
      embeds: [songInfoEmbed(info)],
    });
  },
};
