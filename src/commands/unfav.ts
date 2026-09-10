import { SlashCommandBuilder } from 'discord.js';
import { removeFavourite, searchFavourites } from '../services/favourites';
import type { Command } from '../types/command';
import { getDisplayName } from '../utils/displayName';
import { formatSong, platformLabel, removedFavouriteEmbed } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';
import { buildUnfavMatchMessage, buildUnfavPickerMessage } from '../utils/unfavPicker';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const unfav: Command = {
  data: new SlashCommandBuilder()
    .setName('unfav')
    .setDescription('Remove a song from your favourites')
    .addStringOption((option) =>
      option
        .setName('song')
        .setDescription('Start typing a title or artist, or skip this to pick from your list')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = await searchFavourites(interaction.user.id, focused);

    await interaction.respond(
      matches.map((favourite) => ({
        name: truncateChoice(`${formatSong(favourite)} · ${platformLabel(favourite.platform)}`),
        value: favourite.id,
      })),
    );
  },

  async execute(ctx) {
    const songQuery = ctx.getString('song', false)?.trim() ?? '';

    if (!songQuery) {
      await ctx.deferReply();
      const message = await buildUnfavPickerMessage({
        userId: ctx.user.id,
        displayName: getDisplayName(ctx.user, ctx.member),
        page: 1,
      });
      await ctx.editReply(message);
      return;
    }

    const songId = UUID_PATTERN.test(songQuery)
      ? songQuery
      : await resolveFavouriteId(ctx.user.id, songQuery);

    if (Array.isArray(songId)) {
      await ctx.reply(buildUnfavMatchMessage(ctx.user.id, songId));
      return;
    }

    const favourite = await removeFavourite(songId, ctx.user.id);

    await ctx.reply({
      embeds: [removedFavouriteEmbed(favourite)],
    });
  },
};

async function resolveFavouriteId(
  userId: string,
  query: string,
): Promise<string | Awaited<ReturnType<typeof searchFavourites>>> {
  const matches = await searchFavourites(userId, query);

  if (matches.length === 0) {
    throw new UserFacingError(UserMessages.unfavNotFound);
  }

  const needle = query.trim().toLowerCase();
  const exact = matches.filter((favourite) => {
    const title = favourite.songTitle.toLowerCase();
    const artist = favourite.artist.toLowerCase();
    const combined = formatSong(favourite).toLowerCase();
    return title === needle || artist === needle || combined === needle;
  });

  if (exact.length === 1) {
    return exact[0].id;
  }

  if (matches.length === 1) {
    return matches[0].id;
  }

  return matches;
}

function truncateChoice(value: string): string {
  if (value.length <= 100) {
    return value;
  }

  return `${value.slice(0, 99)}…`;
}
