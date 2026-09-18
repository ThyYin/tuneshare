import { FAVOURITES_PAGE_SIZE, MAX_AUTOCOMPLETE_RESULTS } from '../constants';
import { supabase } from '../database/supabase';
import type {
  AlbumPlatform,
  ArtistCount,
  FavouriteAlbum,
  FavouriteAlbumInsert,
  PaginatedFavouriteAlbums,
} from '../types/favourite';
import { UserFacingError, UserMessages } from '../utils/errors';
import { logger } from '../utils/logger';
import { artistGroupKey, isUnknownArtist, preferredArtistName } from './music/trackCredits';

interface FavouriteAlbumRow {
  id: string;
  discord_user_id: string;
  album_title: string;
  artist: string;
  year: string | null;
  total_tracks: number | null;
  platform: AlbumPlatform;
  platform_album_id: string;
  url: string;
  thumbnail_url: string | null;
  created_at: string;
}

export async function addFavouriteAlbum(input: FavouriteAlbumInsert): Promise<FavouriteAlbum> {
  const { data, error } = await supabase
    .from('favourite_albums')
    .insert({
      discord_user_id: input.discordUserId,
      album_title: input.albumTitle,
      artist: input.artist,
      year: input.year,
      total_tracks: input.totalTracks,
      platform: input.platform,
      platform_album_id: input.platformAlbumId,
      url: input.url,
      thumbnail_url: input.thumbnailUrl,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new UserFacingError(UserMessages.duplicateAlbum);
    }

    logger.error('Failed to save favourite album', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.saveFailed);
  }

  return mapRow(data as FavouriteAlbumRow);
}

export async function listFavouriteAlbums(
  discordUserId: string,
  page: number,
  options?: { pageSize?: number; artist?: string | null; search?: string | null },
): Promise<PaginatedFavouriteAlbums> {
  const pageSize = options?.pageSize ?? FAVOURITES_PAGE_SIZE;
  const artist = options?.artist?.trim() || null;
  const search = options?.search?.trim() || null;
  const searchTerm = search ? sanitizeSearchTerm(search) : '';
  const artistNames = artist ? await albumArtistFilterNames(discordUserId, artist) : null;

  if (search && !searchTerm) {
    return emptyPage(pageSize, artist, search);
  }

  let countQuery = supabase
    .from('favourite_albums')
    .select('id', { count: 'exact', head: true })
    .eq('discord_user_id', discordUserId);

  if (artistNames && artistNames.length > 0) {
    countQuery = countQuery.in('artist', artistNames);
  }

  if (searchTerm) {
    countQuery = countQuery.or(`album_title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    logger.error('Failed to count favourite albums', {
      code: countError.code,
      message: countError.message,
    });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  if (total === 0) {
    return emptyPage(pageSize, artist, search);
  }

  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let dataQuery = supabase
    .from('favourite_albums')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (artistNames && artistNames.length > 0) {
    dataQuery = dataQuery.in('artist', artistNames);
  }

  if (searchTerm) {
    dataQuery = dataQuery.or(`album_title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
  }

  const { data, error } = await dataQuery;

  if (error) {
    logger.error('Failed to list favourite albums', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  return {
    items: (data as FavouriteAlbumRow[] | null)?.map(mapRow) ?? [],
    page: safePage,
    pageSize,
    total,
    totalPages,
    artistFilter: artist,
    searchQuery: search,
  };
}

export async function listAlbumArtistCounts(
  discordUserId: string,
  options?: { search?: string | null },
): Promise<ArtistCount[]> {
  const search = options?.search?.trim() || null;
  const searchTerm = search ? sanitizeSearchTerm(search) : '';

  if (search && !searchTerm) {
    return [];
  }

  let request = supabase
    .from('favourite_albums')
    .select('artist, album_title')
    .eq('discord_user_id', discordUserId);

  if (searchTerm) {
    request = request.or(`album_title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
  }

  const { data, error } = await request;

  if (error) {
    logger.error('Failed to list album artist counts', {
      code: error.code,
      message: error.message,
    });
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

export async function searchFavouriteAlbums(
  discordUserId: string,
  query: string,
): Promise<FavouriteAlbum[]> {
  let request = supabase
    .from('favourite_albums')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .order('created_at', { ascending: false })
    .limit(MAX_AUTOCOMPLETE_RESULTS);

  const term = sanitizeSearchTerm(query);

  if (term) {
    request = request.or(`album_title.ilike.%${term}%,artist.ilike.%${term}%`);
  }

  const { data, error } = await request;

  if (error) {
    logger.error('Failed to search favourite albums', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.loadFailed);
  }

  return (data as FavouriteAlbumRow[] | null)?.map(mapRow) ?? [];
}

export async function removeFavouriteAlbum(id: string, discordUserId: string): Promise<FavouriteAlbum> {
  const { data, error } = await supabase
    .from('favourite_albums')
    .delete()
    .eq('id', id)
    .eq('discord_user_id', discordUserId)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Failed to remove favourite album', { code: error.code, message: error.message });
    throw new UserFacingError(UserMessages.removeFailed);
  }

  if (!data) {
    throw new UserFacingError(UserMessages.unfavAlbumNotFound);
  }

  return mapRow(data as FavouriteAlbumRow);
}

async function albumArtistFilterNames(discordUserId: string, artist: string): Promise<string[]> {
  const groups = await listAlbumArtistCounts(discordUserId);
  const key = artistGroupKey(artist);
  const group = groups.find(
    (item) => item.artist === artist || item.names.includes(artist) || artistGroupKey(item.artist) === key,
  );
  return group?.names ?? [artist];
}

function emptyPage(
  pageSize: number,
  artist: string | null,
  search: string | null,
): PaginatedFavouriteAlbums {
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

function sanitizeSearchTerm(query: string): string {
  return query.replace(/[^\p{L}\p{N}\s\-']/gu, '').trim().slice(0, 40);
}

function mapRow(row: FavouriteAlbumRow): FavouriteAlbum {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    albumTitle: row.album_title,
    artist: row.artist,
    year: row.year,
    totalTracks: row.total_tracks,
    platform: row.platform,
    platformAlbumId: row.platform_album_id,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
  };
}
