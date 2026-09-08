import { SlashCommandBuilder } from 'discord.js';
import { listTopArtists } from '../services/favourites';
import type { Command } from '../types/command';
import { getDisplayName } from '../utils/displayName';
import { topArtistsEmbed, topArtistsPaginationRow } from '../utils/embeds';

export const topartists: Command = {
  data: new SlashCommandBuilder()
    .setName('topartists')
    .setDescription("Show a user's most-favourited artists")
    .addUserOption((option) =>
      option.setName('user').setDescription('Whose top artists to show. Defaults to you.'),
    ),

  async execute(ctx) {
    const user = (await ctx.getUser('user')) ?? ctx.user;
    const member =
      user.id === ctx.user.id ? ctx.member : await ctx.getMember('user');
    const pageData = await listTopArtists(user.id, 1);
    const row = topArtistsPaginationRow(user.id, pageData);

    await ctx.reply({
      embeds: [topArtistsEmbed(getDisplayName(user, member), pageData)],
      components: row ? [row] : [],
    });
  },
};
