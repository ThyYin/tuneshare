import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/command';
import { getDisplayName } from '../utils/displayName';
import { buildAlbumFavouritesMessage } from '../utils/albumFavouritesMessage';

export const favsab: Command = {
  data: new SlashCommandBuilder()
    .setName('favsab')
    .setDescription('Show your favourite albums, or someone else\'s')
    .addUserOption((option) =>
      option.setName('user').setDescription('Whose albums to show. Defaults to you.'),
    ),

  async execute(ctx) {
    const user = (await ctx.getUser('user')) ?? ctx.user;
    const member = user.id === ctx.user.id ? ctx.member : await ctx.getMember('user');

    const message = await buildAlbumFavouritesMessage({
      targetUserId: user.id,
      displayName: getDisplayName(user, member),
      isOwnList: user.id === ctx.user.id,
      page: 1,
    });

    await ctx.reply(message);
  },
};
