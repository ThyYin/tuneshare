import { FAVOURITES_PAGE_SIZE, MAX_AUTOCOMPLETE_RESULTS, TOP_ARTISTS_PAGE_SIZE } from '../constants';
import { supabase } from '../database/supabase';
import type {
  ArtistCount,
  Favourite,
  FavouriteInsert,
  PaginatedArtists,
  PaginatedFavourites,
  Platform,
} from '../types/favourite';
import { UserFacingError, UserMessages } from '../utils/errors';
import { logger } from '../utils/logger';
import { artistGroupKey, isUnknownArtist, preferredArtistName, stripArtistFromTitle } from './music/trackCredits';
import { fetchSpotifyProfileArtist } from './music/spotify';
import { fetchYouTubeMusicArtist } from './music/youtubeMusicArtist';

interface FavouriteRow {
  id: string;
  discord_user_id: string;
  song_title: string;
  artist: string;
  album: string | null;
  platform: Platform;
  platform_song_id: string;
  url: string;
  thumbnail_url: string | null;
  created_at: string;
}

export async function addFavourite(input: FavouriteInsert): Promise<Favourite> {
  const { data, error } = await supabase
    .from('favourites')
    .insert({
      discord_user_id: input.discordUserId,
      song_title: input.songTitle,
      artist: input.artist,
      album: input.album,
      platform: input.platform,
      platform_song_id: input.platformSongId,
      url: input.url,
      thumbnail_url: input.thumbnailUrl,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new UserFacingError(UserMessages.duplicate);
    }

    if (error.code === '23514') {
      throw new UserFacingError(UserMessages.platformNotEnabled);
    }

    logger.error('Failed to save favourite', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.saveFailed);
  }

  return mapRow(data as FavouriteRow);
}

export async function listFavourites(
  discordUserId: string,
  page: number,
  options?: { pageSize?: number; artist?: string | null; search?: string | null },
): Promise<PaginatedFavourites> {
  await ensureRepairedCredits(discordUserId);
  const pageSize = options?.pageSize ?? FAVOURITES_PAGE_SIZE;
  const artist = options?.artist?.trim() || null;
  const search = options?.search?.trim() || null;
  const searchTerm = search ? sanitizeSearchTerm(search) : '';
  const artistNames = artist ? await artistFilterNames(discordUserId, artist) : null;

  if (search && !searchTerm) {
    return {
      items: [],
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      artistFilter: artist,
      searchQuery: search,
    };
  }

  let countQuery = supabase
    .from('favourites')
    .select('id', { count: 'exact', head: true })
    .eq('discord_user_id', discordUserId);

  if (artistNames && artistNames.length > 0) {
    countQuery = countQuery.in('artist', artistNames);
  }

  if (searchTerm) {
    countQuery = countQuery.or(`song_title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    logger.error('Failed to count favourites', { code: countError.code, message: countError.message });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  if (total === 0) {
    return {
      items: [],
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      artistFilter: artist,
      searchQuery: search,
    };
  }

  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let dataQuery = supabase
    .from('favourites')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (artistNames && artistNames.length > 0) {
    dataQuery = dataQuery.in('artist', artistNames);
  }

  if (searchTerm) {
    dataQuery = dataQuery.or(`song_title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
  }

  const { data, error } = await dataQuery;

  if (error) {
    logger.error('Failed to list favourites', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  return {
    items: (data as FavouriteRow[] | null)?.map(mapRow) ?? [],
    page: safePage,
    pageSize,
    total,
    totalPages,
    artistFilter: artist,
    searchQuery: search,
  };
}

export async function listArtistCounts(
  discordUserId: string,
  options?: { search?: string | null },
): Promise<ArtistCount[]> {
  await ensureRepairedCredits(discordUserId);
  const search = options?.search?.trim() || null;
  const searchTerm = search ? sanitizeSearchTerm(search) : '';

  if (search && !searchTerm) {
    return [];
  }

  let request = supabase
    .from('favourites')
    .select('artist, song_title')
    .eq('discord_user_id', discordUserId);

  if (searchTerm) {
    request = request.or(`song_title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
  }

  const { data, error } = await request;

  if (error) {
    logger.error('Failed to list artist counts', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  const counts = new Map<string, { names: string[]; count: number }>();

  for (const row of data ?? []) {
    const rawArtist = typeof row.artist === 'string' ? row.artist.trim() : '';
    if (!rawArtist || isUnknownArtist(rawArtist)) {
      continue;
    }

    const key = artistGroupKey(rawArtist) || rawArtist.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.names.includes(rawArtist)) {
        existing.names.push(rawArtist);
      }
    } else {
      counts.set(key, { names: [rawArtist], count: 1 });
    }
  }

  return [...counts.values()]
    .map((item) => ({
      artist: preferredArtistName(item.names),
      count: item.count,
      names: item.names,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.artist.localeCompare(b.artist);
    });
}

export async function listTopArtists(
  discordUserId: string,
  page: number,
  pageSize: number = TOP_ARTISTS_PAGE_SIZE,
): Promise<PaginatedArtists> {
  const items = await listArtistCounts(discordUserId);
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

export async function searchFavourites(
  discordUserId: string,
  query: string,
): Promise<Favourite[]> {
  await ensureRepairedCredits(discordUserId);
  let request = supabase
    .from('favourites')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .order('created_at', { ascending: false })
    .limit(MAX_AUTOCOMPLETE_RESULTS);

  const term = sanitizeSearchTerm(query);

  if (term) {
    request = request.or(`song_title.ilike.%${term}%,artist.ilike.%${term}%`);
  }

  const { data, error } = await request;

  if (error) {
    logger.error('Failed to search favourites', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  return (data as FavouriteRow[] | null)?.map(mapRow) ?? [];
}

export async function removeFavourite(id: string, discordUserId: string): Promise<Favourite> {
  const { data, error } = await supabase
    .from('favourites')
    .delete()
    .eq('id', id)
    .eq('discord_user_id', discordUserId)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Failed to remove favourite', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.removeFailed);
  }

  if (!data) {
    throw new UserFacingError(UserMessages.unfavNotFound);
  }

  return mapRow(data as FavouriteRow);
}

async function ensureRepairedCredits(discordUserId: string): Promise<void> {
  const { data, error } = await supabase
    .from('favourites')
    .select('*')
    .eq('discord_user_id', discordUserId);

  if (error) {
    logger.error('Failed to load favourites for credit repair', {
      code: error.code,
      message: error.message,
    });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  const rows = (data as FavouriteRow[] | null) ?? [];

  for (const row of rows) {
    const next = await repairFavouriteRow(row, rows);
    if (next.artist === row.artist && next.song_title === row.song_title) {
      continue;
    }

    const { error: updateError } = await supabase
      .from('favourites')
      .update({ artist: next.artist, song_title: next.song_title })
      .eq('id', row.id);

    if (updateError) {
      logger.warn('Failed to persist repaired favourite credits', {
        id: row.id,
        message: updateError.message,
      });
      continue;
    }

    row.artist = next.artist;
    row.song_title = next.song_title;
  }
}

async function artistFilterNames(discordUserId: string, artist: string): Promise<string[]> {
  const groups = await listArtistCounts(discordUserId);
  const key = artistGroupKey(artist);
  const group = groups.find(
    (item) => item.artist === artist || item.names.includes(artist) || artistGroupKey(item.artist) === key,
  );
  return group?.names ?? [artist];
}

async function repairFavouriteRow(row: FavouriteRow, siblings: FavouriteRow[]): Promise<FavouriteRow> {
  let next = row;

  if (row.platform === 'spotify') {
    if (isUnknownArtist(row.artist)) {
      try {
        const profileArtist = await fetchSpotifyProfileArtist(row.platform_song_id);
        if (profileArtist && profileArtist !== row.artist) {
          next = { ...row, artist: profileArtist };
        }
      } catch (error) {
        logger.warn('Failed to refresh Spotify artist profile', {
          id: row.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  } else if (row.platform === 'youtube_music') {
    const key = artistGroupKey(row.artist);
    const hasNameVariants = siblings.some(
      (other) => other.id !== row.id && artistGroupKey(other.artist) === key && other.artist !== row.artist,
    );
    const looksLikeChannelHandle = /vevo/i.test(row.artist) || /-\s*topic$/i.test(row.artist);

    if (isUnknownArtist(row.artist) || hasNameVariants || looksLikeChannelHandle) {
      try {
        const profileArtist = await fetchYouTubeMusicArtist(row.platform_song_id);
        if (profileArtist && profileArtist !== row.artist) {
          next = { ...row, artist: profileArtist };
        }
      } catch (error) {
        logger.warn('Failed to refresh YouTube Music artist profile', {
          id: row.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  }

  const cleanedTitle = stripArtistFromTitle(next.song_title, next.artist);
  if (cleanedTitle !== next.song_title) {
    return { ...next, song_title: cleanedTitle };
  }

  return next;
}

function sanitizeSearchTerm(query: string): string {
  return query.replace(/[^\p{L}\p{N}\s\-']/gu, '').trim().slice(0, 40);
}

function mapRow(row: FavouriteRow): Favourite {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    songTitle: row.song_title,
    artist: row.artist,
    album: row.album,
    platform: row.platform,
    platformSongId: row.platform_song_id,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
  };
}
