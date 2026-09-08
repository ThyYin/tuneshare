import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/command';
import { getDisplayName } from '../utils/displayName';
import { UserFacingError, UserMessages } from '../utils/errors';
import { buildFavouritesMessage } from '../utils/favouritesMessage';

export const view: Command = {
  data: new SlashCommandBuilder()
    .setName('view')
    .setDescription("Show another user's favourite songs")
    .addUserOption((option) =>
      option.setName('user').setDescription('The Discord user to view').setRequired(true),
    ),

  async execute(ctx) {
    const user = await ctx.getUser('user', true);
    if (!user) {
      throw new UserFacingError(UserMessages.missingUser);
    }
    const member = await ctx.getMember('user');
    const message = await buildFavouritesMessage({
      targetUserId: user.id,
      displayName: getDisplayName(user, member),
      isOwnList: user.id === ctx.user.id,
      page: 1,
    });

    await ctx.reply(message);
  },
};
