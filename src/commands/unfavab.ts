import { SlashCommandBuilder } from 'discord.js';
import { removeFavouriteAlbum, searchFavouriteAlbums } from '../services/albumFavourites';
import type { Command } from '../types/command';
import { getDisplayName } from '../utils/displayName';
import { albumPlatformLabel, formatAlbum, removedFavouriteAlbumEmbed } from '../utils/embeds';
import { buildUnfavAlbumPickerMessage } from '../utils/unfavAlbumPicker';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const unfavab: Command = {
  data: new SlashCommandBuilder()
    .setName('unfavab')
    .setDescription('Remove an album from your favourites')
    .addStringOption((option) =>
      option
        .setName('album')
        .setDescription('Start typing a title or artist, or skip this to pick from your list')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = await searchFavouriteAlbums(interaction.user.id, focused);

    await interaction.respond(
      matches.map((album) => ({
        name: truncateChoice(`${formatAlbum(album)} · ${albumPlatformLabel(album.platform)}`),
        value: album.id,
      })),
    );
  },

  async execute(ctx) {
    const albumQuery = ctx.getString('album', false)?.trim() ?? '';

    if (albumQuery && UUID_PATTERN.test(albumQuery)) {
      const album = await removeFavouriteAlbum(albumQuery, ctx.user.id);
      await ctx.reply({
        embeds: [removedFavouriteAlbumEmbed(album)],
      });
      return;
    }

    await ctx.deferReply();
    const message = await buildUnfavAlbumPickerMessage({
      userId: ctx.user.id,
      displayName: getDisplayName(ctx.user, ctx.member),
      page: 1,
      query: albumQuery || null,
    });
    await ctx.editReply(message);
  },
};

function truncateChoice(value: string): string {
  if (value.length <= 100) {
    return value;
  }

  return `${value.slice(0, 99)}…`;
}
