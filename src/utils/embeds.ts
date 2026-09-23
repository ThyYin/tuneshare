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
import type { AlbumTracksPage, AlbumSearchHit, ArtistSearchHit, PaginatedAlbums } from '../services/music/artistCatalogue';
import type { Command } from '../types/command';
import type { SongInfo, SongSearchHit } from '../services/music/types';
import type {
  AlbumPlatform,
  ArtistCount,
  Favourite,
  FavouriteAlbum,
  PaginatedArtists,
  PaginatedFavouriteAlbums,
  PaginatedFavourites,
  Platform,
} from '../types/favourite';
import { stripArtistFromTitle } from '../services/music/trackCredits';
import {
  ALL_ARTISTS_FILTER,
  albumLookupTracksButtonId,
  albumSearchCancelButtonId,
  albumSearchPickButtonId,
  artistFilterKey,
  artistSearchCancelButtonId,
  artistSearchPickButtonId,
  catalogueAlbumPickButtonId,
  catalogueAlbumsButtonId,
  catalogueTracksButtonId,
  searchCancelButtonId,
  searchPickButtonId,
  unfavAlbumButtonId,
  unfavAlbumCancelButtonId,
  unfavAlbumSearchPageButtonId,
  unfavCancelButtonId,
  unfavSearchPageButtonId,
  unfavSongButtonId,
  type AlbumSearchAction,
  type ArtistSearchAction,
  type SongSearchAction,
} from './customIds';

const ADD_COLOR = 0x57f287;
const REMOVE_COLOR = 0xed4245;
const LIST_COLOR = 0x9b59b6;
const HELP_COLOR = 0x99aab5;

const HELP_COMMAND_ORDER = [
  'fav',
  'favs',
  'unfav',
  'favab',
  'favsab',
  'unfavab',
  'song',
  'album',
  'topartists',
  'artist',
  'catalog',
  'help',
  'ping',
];

const HELP_USAGE_NOTES: Record<string, string> = {
  fav: 'Favourite a song by typing its name, or paste a Spotify / YT Music / SoundCloud song link.',
  favs: 'Display your favourited songs, or tag someone to peek at theirs.',
  unfav: 'Unfavourite a song. Filter by favourited song name, or leave blank to view entire list to pick to unfavourite. e.g. `t!unfav Billie Jean` returns search results; if none match in your list, will return error.\n\n',
  favab: 'Favourite an album by name, or paste a Spotify, YouTube Music, Deezer, or SoundCloud link.',
  favsab: 'Display your favourited albums, or tag someone to peek at theirs.',
  unfavab: 'Unfavourite an album. Workflow is similar to the `t!unfav` command.\n\n',
  song: 'Look up song details by name, or paste a Spotify / YT Music / SoundCloud link.',
  album: 'Look up an album by name or link. Spotify and YouTube Music playlists count too. A link opens the tracklist. A name shows the top 5, then the tracks.\n\n',
  topartists: 'Display the top artists from your favourited songs by leaving the user blank for your own ranking, or view someone else\'s by mentioning their user.',
  artist: 'Display an artist\'s info. Type an artist\'s name, pick from top 5 search results.',
  catalog: 'Browse an artist\'s music catalog. Type an artist\'s name, pick from the top 5 search results, then pick an album.\n\n',
  ping: 'Annie are you okay?',
  help: 'Shows this list.',
};

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'spotify':
      return 'Spotify';
    case 'youtube_music':
      return 'YouTube Music';
    case 'soundcloud':
      return 'SoundCloud';
  }
}

export function albumPlatformLabel(platform: AlbumPlatform): string {
  switch (platform) {
    case 'spotify':
      return 'Spotify';
    case 'deezer':
      return 'Deezer';
    case 'soundcloud':
      return 'SoundCloud';
    case 'youtube_music':
      return 'YouTube Music';
  }
}

export function formatAlbum(album: Pick<FavouriteAlbum, 'artist' | 'albumTitle'>): string {
  return `${truncate(album.artist, 80)} — ${truncate(album.albumTitle, 80)}`;
}

export function addedFavouriteEmbed(favourite: Favourite, metadataMissing: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(ADD_COLOR)
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

function applyThumbnail(embed: EmbedBuilder, url: string | null | undefined): void {
  if (url) {
    embed.setThumbnail(url);
  }
}

export function removedFavouriteEmbed(favourite: Favourite): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(REMOVE_COLOR)
    .setTitle('🗑️ Removed from your favourites')
    .setDescription(`🎵 **${formatSong(favourite)}**\n${platformLabel(favourite.platform)}`)
    .setURL(favourite.url);

  applyThumbnail(embed, favourite.thumbnailUrl);
  return embed;
}

export function addedFavouriteAlbumEmbed(album: FavouriteAlbum): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(ADD_COLOR)
    .setTitle('✅ Album added to your favourites')
    .setDescription(`💿 **${formatAlbum(album)}**\n${albumPlatformLabel(album.platform)}`)
    .setURL(album.url);

  applyThumbnail(embed, album.thumbnailUrl);
  return embed;
}

export function removedFavouriteAlbumEmbed(album: FavouriteAlbum): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(REMOVE_COLOR)
    .setTitle('🗑️ Album removed from your favourites')
    .setDescription(`💿 **${formatAlbum(album)}**\n${albumPlatformLabel(album.platform)}`)
    .setURL(album.url);

  applyThumbnail(embed, album.thumbnailUrl);
  return embed;
}

export function favouritesListEmbeds(
  displayName: string,
  pageData: PaginatedFavourites,
  isOwnList: boolean,
  options?: { title?: string; accent?: 'list' | 'remove' },
): EmbedBuilder[] {
  const title = options?.title ?? `🎵 ${displayName}'s Favourite Songs`;
  const color = options?.accent === 'remove' ? REMOVE_COLOR : LIST_COLOR;

  if (pageData.total === 0) {
    return [
      new EmbedBuilder()
        .setColor(color)
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
  const footerParts = [`Page ${pageData.page}/${pageData.totalPages}`];
  if (pageData.artistFilter) {
    footerParts.push(pageData.artistFilter);
  }
  if (pageData.searchQuery) {
    footerParts.push(`Search: ${truncate(pageData.searchQuery, 40)}`);
  }
  const footer = footerParts.join(' · ');

  return pageData.items.map((song, index) => {
    const number = start + index + 1;
    const embed = new EmbedBuilder()
      .setColor(color)
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

export function favouriteAlbumsListEmbeds(
  displayName: string,
  pageData: PaginatedFavouriteAlbums,
  isOwnList: boolean,
  options?: { title?: string; accent?: 'list' | 'remove' },
): EmbedBuilder[] {
  const title = options?.title ?? `💿 ${displayName}'s Favourite Albums`;
  const color = options?.accent === 'remove' ? REMOVE_COLOR : LIST_COLOR;

  if (pageData.total === 0) {
    return [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(
          pageData.artistFilter
            ? `${displayName} has no favourite albums by ${pageData.artistFilter}.`
            : isOwnList
              ? "You don't have any favourite albums yet.\nAdd one with `/favab`."
              : `${displayName} doesn't have any favourite albums yet.`,
        ),
    ];
  }

  const start = (pageData.page - 1) * pageData.pageSize;
  const footerParts = [`Page ${pageData.page}/${pageData.totalPages}`];
  if (pageData.artistFilter) {
    footerParts.push(pageData.artistFilter);
  }
  if (pageData.searchQuery) {
    footerParts.push(`Search: ${truncate(pageData.searchQuery, 40)}`);
  }
  const footer = footerParts.join(' · ');

  return pageData.items.map((album, index) => {
    const number = start + index + 1;
    const details = [
      albumPlatformLabel(album.platform),
      album.year,
      album.totalTracks !== null
        ? `${album.totalTracks} ${album.totalTracks === 1 ? 'song' : 'songs'}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(`${number}. **${formatAlbum(album)}**\n${details}\n${album.url}`)
      .setURL(album.url);

    if (index === 0) {
      embed.setTitle(title);
    }

    applyThumbnail(embed, album.thumbnailUrl);

    if (index === pageData.items.length - 1) {
      embed.setFooter({ text: footer });
    }

    return embed;
  });
}

export function songSearchEmbeds(query: string, results: SongSearchHit[]): EmbedBuilder[] {
  return results.map((song, index) => {
    const embed = new EmbedBuilder()
      .setColor(LIST_COLOR)
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

export function artistSearchEmbeds(query: string, results: ArtistSearchHit[]): EmbedBuilder[] {
  return results.map((artist, index) => {
    const embed = new EmbedBuilder()
      .setColor(LIST_COLOR)
      .setDescription(
        [`${index + 1}. **${truncate(artist.name, 80)}**`, artist.genre ? truncate(artist.genre, 80) : 'Artist']
          .join('\n'),
      )
      .setURL(artist.pageUrl);

    if (index === 0) {
      embed.setTitle(`🔍 Artists matching "${truncate(query, 80)}"`);
    }

    applyThumbnail(embed, artist.portraitUrl);
    return embed;
  });
}

export function artistSearchPickRow(
  action: ArtistSearchAction,
  userId: string,
  results: ArtistSearchHit[],
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...results.map((artist, index) =>
      new ButtonBuilder()
        .setCustomId(artistSearchPickButtonId(action, userId, artist.source, artist.artistId))
        .setLabel(String(index + 1))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

export function artistSearchCancelRow(
  action: ArtistSearchAction,
  userId: string,
): ActionRowBuilder<ButtonBuilder> {
  return cancelPickRow(artistSearchCancelButtonId(action, userId));
}

export function albumSearchEmbeds(query: string, results: AlbumSearchHit[]): EmbedBuilder[] {
  return results.map((album, index) => {
    const details = [album.artist, album.albumType, album.year].filter(Boolean).join(' · ');
    const embed = new EmbedBuilder()
      .setColor(LIST_COLOR)
      .setDescription(`${index + 1}. **${truncate(album.name, 80)}**\n${details || 'Album'}`)
      .setURL(album.pageUrl);

    if (index === 0) {
      embed.setTitle(`🔍 Albums matching "${truncate(query, 80)}"`);
    }

    applyThumbnail(embed, album.thumbnailUrl);
    return embed;
  });
}

export function albumSearchPickRow(
  action: AlbumSearchAction,
  userId: string,
  results: AlbumSearchHit[],
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...results.map((album, index) =>
      new ButtonBuilder()
        .setCustomId(
          albumSearchPickButtonId(action, userId, album.source, album.artistId, album.albumId),
        )
        .setLabel(String(index + 1))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

export function albumSearchCancelRow(
  action: AlbumSearchAction,
  userId: string,
): ActionRowBuilder<ButtonBuilder> {
  return cancelPickRow(albumSearchCancelButtonId(action, userId));
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

export function cancelPickRow(customId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );
}

export function songSearchCancelRow(
  action: SongSearchAction,
  userId: string,
): ActionRowBuilder<ButtonBuilder> {
  return cancelPickRow(searchCancelButtonId(action, userId));
}

export function unfavCancelRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return cancelPickRow(unfavCancelButtonId(userId));
}

export function unfavAlbumCancelRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return cancelPickRow(unfavAlbumCancelButtonId(userId));
}

export function unfavAlbumPickRow(
  userId: string,
  albums: FavouriteAlbum[],
  startIndex: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...albums.map((album, index) =>
      new ButtonBuilder()
        .setCustomId(unfavAlbumButtonId(userId, album.id))
        .setLabel(String(startIndex + index + 1))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

export function unfavAlbumPaginationRow(
  userId: string,
  pageData: PaginatedFavouriteAlbums,
  options?: { artistKey?: string; searchToken?: string },
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.totalPages <= 1) {
    return null;
  }

  const artistKey = options?.artistKey || ALL_ARTISTS_FILTER;
  const searchToken = options?.searchToken;
  const pageId = (page: number) =>
    searchToken
      ? unfavAlbumSearchPageButtonId(userId, page, searchToken, artistKey)
      : `unfavab-page:${userId}:${page}:${artistKey}`;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(pageId(pageData.page - 1))
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page <= 1),
    new ButtonBuilder()
      .setCustomId(searchToken ? `unfavab-q:noop:${userId}` : `unfavab-page:noop:${userId}`)
      .setLabel(`${pageData.page} / ${pageData.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(pageId(pageData.page + 1))
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page >= pageData.totalPages),
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
  options?: { artistKey?: string; searchToken?: string },
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.totalPages <= 1) {
    return null;
  }

  const artistKey = options?.artistKey || ALL_ARTISTS_FILTER;
  const searchToken = options?.searchToken;
  const pageId = (page: number) =>
    searchToken
      ? unfavSearchPageButtonId(userId, page, searchToken, artistKey)
      : `unfav-page:${userId}:${page}:${artistKey}`;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(pageId(pageData.page - 1))
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page <= 1),
    new ButtonBuilder()
      .setCustomId(searchToken ? `unfav-q:noop:${userId}` : `unfav-page:noop:${userId}`)
      .setLabel(`${pageData.page} / ${pageData.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(pageId(pageData.page + 1))
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

export function albumFavouritesPaginationRow(
  targetUserId: string,
  pageData: PaginatedFavouriteAlbums,
  artistKey: string,
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.totalPages <= 1) {
    return null;
  }

  const filter = artistKey || ALL_ARTISTS_FILTER;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`favsab:${targetUserId}:${pageData.page - 1}:${filter}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page <= 1),
    new ButtonBuilder()
      .setCustomId(`favsab:noop:${targetUserId}`)
      .setLabel(`${pageData.page} / ${pageData.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`favsab:${targetUserId}:${pageData.page + 1}:${filter}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page >= pageData.totalPages),
  );
}

export function artistFilterSelectRow(
  targetUserId: string,
  artists: ArtistCount[],
  selectedKey: string,
  options?: { customId?: string; allDescription?: string; countNoun?: string },
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (artists.length === 0) {
    return null;
  }

  const countNoun = options?.countNoun ?? 'song';

  const selectOptions = [
    new StringSelectMenuOptionBuilder()
      .setLabel('All artists')
      .setDescription(options?.allDescription ?? 'Show every favourite song')
      .setValue(ALL_ARTISTS_FILTER)
      .setDefault(selectedKey === ALL_ARTISTS_FILTER),
  ];

  for (const item of artists.slice(0, MAX_ARTIST_SELECT_OPTIONS)) {
    const value = artistFilterKey(item.artist);
    const noun = item.count === 1 ? countNoun : `${countNoun}s`;
    selectOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(truncate(item.artist, 100))
        .setDescription(`${item.count} ${noun}`)
        .setValue(value)
        .setDefault(selectedKey === value),
    );
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(options?.customId ?? `favs-filter:${targetUserId}`)
      .setPlaceholder('Filter by artist')
      .addOptions(selectOptions),
  );
}

export function topArtistsEmbed(displayName: string, pageData: PaginatedArtists): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(LIST_COLOR)
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
    .setColor(LIST_COLOR)
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

export function artistAlbumsEmbeds(
  pageData: PaginatedAlbums,
  profile?: ArtistProfile | null,
): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];

  if (profile) {
    embeds.push(artistProfileEmbed(profile));
  }

  if (pageData.total === 0) {
    if (!profile) {
      embeds.push(
        new EmbedBuilder()
          .setColor(LIST_COLOR)
          .setTitle(truncate(`${pageData.artist.name}'s Catalogue`, 240))
          .setDescription("I couldn't find any albums for this artist.")
          .setURL(pageData.artist.pageUrl),
      );
    }
    return embeds;
  }

  const start = (pageData.page - 1) * pageData.pageSize;
  const footer = `Page ${pageData.page}/${pageData.totalPages} · ${pageData.total} ${pageData.total === 1 ? 'release' : 'releases'}`;

  pageData.items.forEach((album, index) => {
    const number = start + index + 1;
    const details = [
      album.albumType,
      album.year,
      album.totalTracks !== null
        ? `${album.totalTracks} ${album.totalTracks === 1 ? 'song' : 'songs'}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const embed = new EmbedBuilder()
      .setColor(LIST_COLOR)
      .setDescription(`${number}. **${truncate(album.name, 80)}**\n${details || 'Album'}`)
      .setURL(album.pageUrl);

    if (index === 0 && !profile) {
      embed.setTitle(truncate(`${pageData.artist.name}'s Catalogue`, 240));
    } else if (index === 0) {
      embed.setTitle('💿 Albums');
    }

    applyThumbnail(embed, album.thumbnailUrl);

    if (index === pageData.items.length - 1) {
      embed.setFooter({ text: footer });
    }

    embeds.push(embed);
  });

  return embeds;
}

export function artistAlbumPickRow(
  userId: string,
  pageData: PaginatedAlbums,
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.items.length === 0) {
    return null;
  }

  const start = (pageData.page - 1) * pageData.pageSize;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...pageData.items.map((album, index) =>
      new ButtonBuilder()
        .setCustomId(
          catalogueAlbumPickButtonId(
            userId,
            pageData.artist.source,
            pageData.artist.artistId,
            album.albumId,
            pageData.page,
          ),
        )
        .setLabel(String(start + index + 1))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

export function artistAlbumsPaginationRow(
  userId: string,
  pageData: PaginatedAlbums,
): ActionRowBuilder<ButtonBuilder> | null {
  if (pageData.totalPages <= 1) {
    return null;
  }

  const { source, artistId } = pageData.artist;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(catalogueAlbumsButtonId(userId, source, artistId, pageData.page - 1))
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page <= 1),
    new ButtonBuilder()
      .setCustomId(`cat-alb:noop:${userId}`)
      .setLabel(`${pageData.page} / ${pageData.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(catalogueAlbumsButtonId(userId, source, artistId, pageData.page + 1))
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageData.page >= pageData.totalPages),
  );
}

export function artistTracksEmbed(pageData: AlbumTracksPage): EmbedBuilder {
  const details = [
    pageData.artist.name,
    pageData.album.albumType,
    pageData.album.year,
    `${pageData.total} ${pageData.total === 1 ? 'song' : 'songs'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const lines =
    pageData.items.length === 0
      ? ['No tracks found on this album.']
      : pageData.items.map((track) => {
          const number = track.trackNumber ?? 0;
          const title = track.url
            ? `[${truncate(track.name, 80)}](${track.url})`
            : `**${truncate(track.name, 80)}**`;
          const duration = track.durationLabel ? ` · ${track.durationLabel}` : '';
          return `${number}. ${title}${duration}`;
        });

  const embed = new EmbedBuilder()
    .setColor(LIST_COLOR)
    .setURL(pageData.album.pageUrl)
    .setDescription(`${details}\n\n${lines.join('\n')}`)
    .setFooter({
      text:
        pageData.totalPages > 1
          ? `Page ${pageData.page}/${pageData.totalPages}`
          : `${pageData.total} ${pageData.total === 1 ? 'song' : 'songs'}`,
    });

  if (pageData.album.thumbnailUrl) {
    embed.setThumbnail(pageData.album.thumbnailUrl);
  }

  return embed;
}

export function artistTracksNavRow(
  userId: string,
  pageData: AlbumTracksPage,
  albumsPage: number,
  options?: { showBack?: boolean },
): ActionRowBuilder<ButtonBuilder> | null {
  const { source, artistId } = pageData.artist;
  const showBack = options?.showBack !== false;
  const buttons: ButtonBuilder[] = [];

  if (showBack) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(catalogueAlbumsButtonId(userId, source, artistId, albumsPage))
        .setLabel('Back')
        .setStyle(ButtonStyle.Primary),
    );
  }

  if (pageData.totalPages > 1) {
    const prevId = showBack
      ? catalogueTracksButtonId(
          userId,
          source,
          artistId,
          pageData.album.albumId,
          pageData.page - 1,
          albumsPage,
        )
      : albumLookupTracksButtonId(userId, source, artistId, pageData.album.albumId, pageData.page - 1);
    const nextId = showBack
      ? catalogueTracksButtonId(
          userId,
          source,
          artistId,
          pageData.album.albumId,
          pageData.page + 1,
          albumsPage,
        )
      : albumLookupTracksButtonId(userId, source, artistId, pageData.album.albumId, pageData.page + 1);

    buttons.push(
      new ButtonBuilder()
        .setCustomId(prevId)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageData.page <= 1),
      new ButtonBuilder()
        .setCustomId(showBack ? `cat-trk:noop:${userId}` : `alb-trk:noop:${userId}`)
        .setLabel(`${pageData.page} / ${pageData.totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageData.page >= pageData.totalPages),
    );
  }

  if (buttons.length === 0) {
    return null;
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
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
    .setColor(HELP_COLOR)
    .setTitle('Command Lists')
    .setDescription(
      [
        'Favourite your songs, share your music taste, explore artists and more!',
        'Use `/command` or `t!command` - both works!',
        '',
        ...lines,
      ].join('\n\n'),
    )
    .setFooter({ text: 'p.s. Type a song name, or paste a Spotify / YT Music / SoundCloud link.' });
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
    .setColor(LIST_COLOR)
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
