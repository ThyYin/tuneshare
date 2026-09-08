import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/command';
import { getDisplayName } from '../utils/displayName';
import { buildFavouritesMessage } from '../utils/favouritesMessage';

export const favs: Command = {
  data: new SlashCommandBuilder()
    .setName('favs')
    .setDescription('Show your favourite songs'),

  async execute(ctx) {
    const message = await buildFavouritesMessage({
      targetUserId: ctx.user.id,
      displayName: getDisplayName(ctx.user, ctx.member),
      isOwnList: true,
      page: 1,
    });

    await ctx.reply(message);
  },
};
