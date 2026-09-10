import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { MAX_ARTIST_SELECT_OPTIONS } from '../constants';
import type { ArtistProfile } from '../services/artists';
import type { Command } from '../types/command';
import type { SongInfo, SongSearchHit } from '../services/music/types';
import type { ArtistCount, Favourite, PaginatedArtists, PaginatedFavourites, Platform } from '../types/favourite';
import { stripArtistFromTitle } from '../services/music/trackCredits';
import { ALL_ARTISTS_FILTER, artistFilterKey, searchPickButtonId, unfavSongButtonId, type SongSearchAction } from './customIds';

const SPOTIFY_COLOR = 0x1db954;
const YOUTUBE_COLOR = 0x1db954;
const DEFAULT_COLOR = 0x5865f2;

const HELP_COMMAND_ORDER = [
  'fav',
  'favs',
  'view',
  'unfav',
  'info',
  'topartists',
  'artist',
  'help',
  'ping',
];

const HELP_USAGE_NOTES: Record<string, string> = {
  fav: 'Favourite a song by typing its name, or paste a Spotify / YT Music song link.',
  favs: 'Display your list of favourited songs.',
  view: 'Display a server member\'s list of favourited songs.',
  unfav: 'Unfavourite a song.\nSlash: start typing to pick it.\nPrefix: `t!unfav` shows your list so you can pick one.',
  info: 'Look up a song by name or paste a Spotify / YT Music link.',
  topartists: 'Display the top artists from your favourited songs by leaving the user blank for your own ranking, or view someone else\'s by mentioning their user.',
  artist: 'Display an artist\'s info by typing their name.',
  ping: 'Annie are you okay?',
  help: 'Shows this list.',
};

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'spotify':
      return 'Spotify';
    case 'youtube_music':
      return 'YouTube Music';
  }
}

export function addedFavouriteEmbed(favourite: Favourite, metadataMissing: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(favourite.platform === 'spotify' ? SPOTIFY_COLOR : YOUTUBE_COLOR)
    .setTitle('✅ Added to your favourites')
    .setDescription(
      [
        `🎵 **${formatSong(favourite)}**`,
        platformLabel(favourite.platform),
        metadataMissing
          ? '\n⚠️ I couldn\'t retrieve the full song information, but the link was still saved.'
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setURL(favourite.url);

  if (favourite.thumbnailUrl) {
    embed.setThumbnail(favourite.thumbnailUrl);
  }

  return embed;
}

function platformColor(platform: Platform): number {
  return platform === 'spotify' ? SPOTIFY_COLOR : YOUTUBE_COLOR;
}

function applyThumbnail(embed: EmbedBuilder, url: string | null | undefined): void {
  if (url) {
    embed.setThumbnail(url);
  }
}

export function removedFavouriteEmbed(favourite: Favourite): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle('🗑️ Removed from your favourites')
    .setDescription(`🎵 **${formatSong(favourite)}**\n${platformLabel(favourite.platform)}`)
    .setURL(favourite.url);

  applyThumbnail(embed, favourite.thumbnailUrl);
  return embed;
}

export function favouritesListEmbeds(
  displayName: string,
  pageData: PaginatedFavourites,
  isOwnList: boolean,
  options?: { title?: string },
): EmbedBuilder[] {
  const title = options?.title ?? `🎵 ${displayName}'s Favourite Songs`;

  if (pageData.total === 0) {
    return [
      new EmbedBuilder()
        .setColor(DEFAULT_COLOR)
        .setTitle(title)
        .setDescription(
          pageData.artistFilter
            ? `${displayName} has no favourite songs by ${pageData.artistFilter}.`
            : isOwnList
              ? "You don't have any favourite songs yet.\nAdd one with `/fav`."
              : `${displayName} doesn't have any favourite songs yet.`,
        ),
    ];
  }

  const start = (pageData.page - 1) * pageData.pageSize;
  const footer = pageData.artistFilter
    ? `Page ${pageData.page}/${pageData.totalPages} · ${pageData.artistFilter}`
    : `Page ${pageData.page}/${pageData.totalPages}`;

  return pageData.items.map((song, index) => {
    const number = start + index + 1;
    const embed = new EmbedBuilder()
      .setColor(platformColor(song.platform))
      .setDescription(
        `${number}. **${formatSong(song)}**\n${platformLabel(song.platform)}\n${song.url}`,
      )
      .setURL(song.url);

    if (index === 0) {
      embed.setTitle(title);
    }

    applyThumbnail(embed, song.thumbnailUrl);

    if (index === pageData.items.length - 1) {
      embed.setFooter({ text: footer });
    }

    return embed;
  });
}

export function songSearchEmbeds(query: string, results: SongSearchHit[]): EmbedBuilder[] {
  return results.map((song, index) => {
    const embed = new EmbedBuilder()
      .setColor(platformColor(song.platform))
      .setDescription(
        [
          `${index + 1}. **${formatTrack(song.artist, song.title)}**`,
          platformLabel(song.platform),
          song.album ? `💿 ${truncate(song.album, 80)}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .setURL(song.canonicalUrl);

    if (index === 0) {
      embed.setTitle(`🔍 Results for "${truncate(query, 80)}"`);
    }

    applyThumbnail(embed, song.thumbnailUrl);
    return embed;
  });
}

export function songSearchPickRow(
  action: SongSearchAction,
  userId: string,
  results: SongSearchHit[],
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...results.map((song, index) =>
      new ButtonBuilder()
        .setCustomId(searchPickButtonId(action, userId, song.platform, song.platformSongId))
        .setLabel(String(index + 1))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

export function unfavPickRow(
  userId: string,
  songs: Favourite[],
  startIndex: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...songs.map((song, index) =>
      new ButtonBuilder()
        .setCustomId(unfavSongButtonId(userId, song.id))
        .setLabel(String(startIndex + index + 1))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

export function unfavPaginationRow(
  userId: string,
  pageData: PaginatedFavourites,
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.totalPages <= 1) {
    return null;
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`unfav-page:${userId}:${pageData.page - 1}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page <= 1),
    new ButtonBuilder()
      .setCustomId(`unfav-page:noop:${userId}`)
      .setLabel(`${pageData.page} / ${pageData.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`unfav-page:${userId}:${pageData.page + 1}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page >= pageData.totalPages),
  );
}

export function favouritesPaginationRow(
  targetUserId: string,
  pageData: PaginatedFavourites,
  artistKey: string,
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.totalPages <= 1) {
    return null;
  }

  const filter = artistKey || ALL_ARTISTS_FILTER;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`favs:${targetUserId}:${pageData.page - 1}:${filter}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page <= 1),
    new ButtonBuilder()
      .setCustomId(`favs:noop:${targetUserId}`)
      .setLabel(`${pageData.page} / ${pageData.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`favs:${targetUserId}:${pageData.page + 1}:${filter}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page >= pageData.totalPages),
  );
}

export function artistFilterSelectRow(
  targetUserId: string,
  artists: ArtistCount[],
  selectedKey: string,
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (artists.length === 0) {
    return null;
  }

  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('All artists')
      .setDescription('Show every favourite song')
      .setValue(ALL_ARTISTS_FILTER)
      .setDefault(selectedKey === ALL_ARTISTS_FILTER),
  ];

  for (const item of artists.slice(0, MAX_ARTIST_SELECT_OPTIONS)) {
    const value = artistFilterKey(item.artist);
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(truncate(item.artist, 100))
        .setDescription(`${item.count} ${item.count === 1 ? 'song' : 'songs'}`)
        .setValue(value)
        .setDefault(selectedKey === value),
    );
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`favs-filter:${targetUserId}`)
      .setPlaceholder('Filter by artist')
      .addOptions(options),
  );
}

export function topArtistsEmbed(displayName: string, pageData: PaginatedArtists): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle(`🎤 ${displayName}'s Top Artists`);

  if (pageData.total === 0) {
    embed.setDescription('No favourite songs yet, so there are no top artists to show.');
    return embed;
  }

  const start = (pageData.page - 1) * pageData.pageSize;
  const lines = pageData.items.map((item, index) => {
    const number = start + index + 1;
    const songLabel = item.count === 1 ? 'song' : 'songs';
    return `${number}. **${item.artist}** (${item.count} ${songLabel})`;
  });

  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `Page ${pageData.page}/${pageData.totalPages}` });
  return embed;
}

export function topArtistsPaginationRow(
  targetUserId: string,
  pageData: PaginatedArtists,
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.totalPages <= 1) {
    return null;
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`topart:${targetUserId}:${pageData.page - 1}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page <= 1),
    new ButtonBuilder()
      .setCustomId(`topart:noop:${targetUserId}`)
      .setLabel(`${pageData.page} / ${pageData.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`topart:${targetUserId}:${pageData.page + 1}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page >= pageData.totalPages),
  );
}

export function artistProfileEmbed(profile: ArtistProfile): EmbedBuilder {
  const bornLabel = profile.isPerson ? 'Born' : 'Formed';
  const passedLabel = profile.isPerson ? 'Passed' : 'Disbanded';

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle(truncate(profile.name, 240))
    .setURL(profile.pageUrl)
    .addFields(
      { name: 'Genre', value: profile.genre ?? 'Unknown', inline: true },
      { name: bornLabel, value: profile.bornYear ?? 'Unknown', inline: true },
      { name: passedLabel, value: profile.passedYear ?? 'Alive', inline: true },
      { name: 'Artist page', value: profile.pageUrl, inline: false },
    )
    .setFooter({ text: `Source: ${profile.sourceLabel}` });

  if (profile.portraitUrl) {
    embed.setImage(profile.portraitUrl);
  }

  return embed;
}

export function helpEmbed(commandList: Command[]): EmbedBuilder {
  const ranked = [...commandList].sort((a, b) => {
    const aIndex = HELP_COMMAND_ORDER.indexOf(a.data.name);
    const bIndex = HELP_COMMAND_ORDER.indexOf(b.data.name);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  const lines = ranked.map((command) => {
    const json = command.data.toJSON() as {
      name: string;
      description: string;
      options?: Array<{ name: string; required?: boolean; type?: number }>;
    };
    const extra = HELP_USAGE_NOTES[json.name];

    return [`**\`${formatCommandUsage(json)}\`**`, extra ?? json.description].join('\n');
  });

  return new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle('Command Lists')
    .setDescription(
      [
        'Favourite your songs, share your music taste, explore artists and more!',
        'Use `/command` or `t!command` - both works!',
        '',
        ...lines,
      ].join('\n\n'),
    )
    .setFooter({ text: 'p.s. Type a song name, or paste a Spotify / YT Music link.' });
}

function formatCommandUsage(data: {
  name: string;
  options?: Array<{ name: string; required?: boolean; type?: number }>;
}): string {
  const options = (data.options ?? []).map((option) => {
    const isUser = option.type === ApplicationCommandOptionType.User;
    const token = isUser ? `@${option.name}` : option.name;

    if (option.required) {
      return isUser ? token : `<${token}>`;
    }

    return `[${token}]`;
  });

  return options.length > 0
    ? `/${data.name} ${options.join(' ')}  ·  t!${data.name} ${options.join(' ')}`
    : `/${data.name}  ·  t!${data.name}`;
}

export function formatSong(favourite: Pick<Favourite, 'artist' | 'songTitle'>): string {
  return formatTrack(favourite.artist, favourite.songTitle);
}

export function formatTrack(artist: string, title: string): string {
  return `${truncate(artist, 80)} — ${truncate(stripArtistFromTitle(title, artist), 80)}`;
}

export function songInfoEmbed(info: SongInfo): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(info.platform === 'spotify' ? SPOTIFY_COLOR : YOUTUBE_COLOR)
    .setTitle(truncate(stripArtistFromTitle(info.title, info.artist), 240))
    .setURL(info.canonicalUrl)
    .setDescription(platformLabel(info.platform));

  const fields = [
    { name: 'Artist', value: truncate(info.artist, 256), inline: true },
    { name: 'Album', value: truncate(info.album ?? 'Unknown', 256), inline: true },
    { name: 'Released', value: info.releaseYear ?? 'Unknown', inline: true },
  ];

  if (info.audience.length > 0) {
    for (const stat of info.audience) {
      fields.push({ name: stat.label, value: stat.value, inline: true });
    }
  } else {
    fields.push({ name: 'Listeners', value: 'Unknown', inline: true });
  }

  embed.addFields(fields);

  if (info.thumbnailUrl) {
    embed.setImage(info.thumbnailUrl);
  }

  return embed;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}
