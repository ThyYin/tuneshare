import { ARTIST_ALBUMS_PAGE_SIZE, ARTIST_TRACKS_PAGE_SIZE, MAX_ALBUM_SEARCH_RESULTS, MAX_ARTIST_SEARCH_RESULTS } from '../../constants';
import { getSpotifyCredentials } from '../../config/env';
import { formatDuration, yearFromDate } from '../../utils/format';
import { UserFacingError, UserMessages } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { asRecord, fetchJson, readArray, readNumber, readRecord, readString } from './http';
import {
  fetchSoundCloudAlbumDetails,
  fetchSoundCloudAlbumTracks,
  SOUNDCLOUD_ID_PATTERN,
  type SoundCloudAlbumDetails,
} from './soundcloud';
import { getSpotifyAppToken } from './spotifyAuth';

export type CatalogueSource = 'spotify' | 'deezer' | 'soundcloud';

export interface CatalogueArtist {
  source: CatalogueSource;
  artistId: string;
  name: string;
  portraitUrl: string | null;
  pageUrl: string;
}

export interface ArtistSearchHit extends CatalogueArtist {
  genre: string | null;
}

export interface AlbumSearchHit {
  source: CatalogueSource;
  albumId: string;
  artistId: string;
  name: string;
  artist: string;
  year: string | null;
  totalTracks: number | null;
  albumType: string | null;
  thumbnailUrl: string | null;
  pageUrl: string;
}

export interface CatalogueAlbum {
  source: CatalogueSource;
  albumId: string;
  name: string;
  year: string | null;
  totalTracks: number | null;
  albumType: string | null;
  thumbnailUrl: string | null;
  pageUrl: string;
}

export interface PaginatedAlbums {
  artist: CatalogueArtist;
  items: CatalogueAlbum[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CatalogueTrack {
  name: string;
  trackNumber: number | null;
  durationLabel: string | null;
  url: string | null;
}

export interface AlbumTracksPage {
  artist: CatalogueArtist;
  album: CatalogueAlbum;
  items: CatalogueTrack[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const DEEZER_ID_PATTERN = /^\d{1,12}$/;

export async function searchArtistCatalogue(
  name: string,
  page: number,
  spotifyArtistId?: string | null,
): Promise<PaginatedAlbums | null> {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }

  if (getSpotifyCredentials()) {
    try {
      const artistId =
        spotifyArtistId && SPOTIFY_ID_PATTERN.test(spotifyArtistId)
          ? spotifyArtistId
          : await searchSpotifyArtistId(cleaned);
      if (artistId) {
        const albums = await fetchSpotifyAlbums(artistId, page);
        if (albums) {
          return albums;
        }
      }
    } catch (error) {
      logger.warn('Spotify artist catalogue failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  try {
    const artistId = await searchDeezerArtistId(cleaned);
    if (artistId) {
      return fetchDeezerAlbums(artistId, page);
    }
  } catch (error) {
    logger.warn('Deezer artist catalogue failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return null;
}

export async function searchCatalogueArtists(query: string): Promise<ArtistSearchHit[]> {
  const cleaned = query.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return [];
  }

  if (getSpotifyCredentials()) {
    try {
      const spotify = await searchSpotifyArtists(cleaned);
      if (spotify.length > 0) {
        return spotify;
      }
    } catch (error) {
      logger.warn('Spotify artist search failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  try {
    return await searchDeezerArtists(cleaned);
  } catch (error) {
    logger.warn('Deezer artist search failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}

export async function searchCatalogueArtistsOrThrow(query: string): Promise<ArtistSearchHit[]> {
  try {
    const results = await searchCatalogueArtists(query);
    if (results.length === 0) {
      throw new UserFacingError(UserMessages.artistNotFound);
    }
    return results;
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    logger.warn('Artist search failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw new UserFacingError(UserMessages.artistSearchFailed);
  }
}

export async function searchCatalogueAlbums(query: string): Promise<AlbumSearchHit[]> {
  const cleaned = query.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return [];
  }

  if (getSpotifyCredentials()) {
    try {
      const spotify = await searchSpotifyAlbums(cleaned);
      if (spotify.length > 0) {
        return spotify;
      }
    } catch (error) {
      logger.warn('Spotify album search failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  try {
    return await searchDeezerAlbums(cleaned);
  } catch (error) {
    logger.warn('Deezer album search failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}

export async function searchCatalogueAlbumsOrThrow(query: string): Promise<AlbumSearchHit[]> {
  try {
    const results = await searchCatalogueAlbums(query);
    if (results.length === 0) {
      throw new UserFacingError(UserMessages.albumNotFound);
    }
    return results;
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    logger.warn('Album search failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw new UserFacingError(UserMessages.albumSearchFailed);
  }
}

export async function fetchAlbumSearchHit(
  source: CatalogueSource,
  albumId: string,
): Promise<AlbumSearchHit | null> {
  try {
    if (source === 'spotify' && SPOTIFY_ID_PATTERN.test(albumId)) {
      return await fetchSpotifyAlbumHit(albumId);
    }
    if (source === 'deezer' && DEEZER_ID_PATTERN.test(albumId)) {
      return await fetchDeezerAlbumHit(albumId);
    }
    if (source === 'soundcloud') {
      return mapSoundCloudAlbumHit(await fetchSoundCloudAlbumDetails(albumId));
    }
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }
    logger.warn('Album lookup failed', {
      source,
      albumId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return null;
}

export async function getArtistAlbums(
  source: CatalogueSource,
  artistId: string,
  page: number,
): Promise<PaginatedAlbums | null> {
  try {
    if (source === 'spotify' && SPOTIFY_ID_PATTERN.test(artistId)) {
      return await fetchSpotifyAlbums(artistId, page);
    }
    if (source === 'deezer' && DEEZER_ID_PATTERN.test(artistId)) {
      return await fetchDeezerAlbums(artistId, page);
    }
  } catch (error) {
    logger.warn('Artist album list failed', {
      source,
      artistId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return null;
}

export async function getAlbumTracks(
  source: CatalogueSource,
  artistId: string,
  albumId: string,
  page: number,
): Promise<AlbumTracksPage | null> {
  try {
    if (source === 'spotify' && SPOTIFY_ID_PATTERN.test(artistId) && SPOTIFY_ID_PATTERN.test(albumId)) {
      return await fetchSpotifyAlbumTracks(artistId, albumId, page);
    }
    if (source === 'deezer' && DEEZER_ID_PATTERN.test(artistId) && DEEZER_ID_PATTERN.test(albumId)) {
      return await fetchDeezerAlbumTracks(artistId, albumId, page);
    }
    if (source === 'soundcloud' && SOUNDCLOUD_ID_PATTERN.test(albumId)) {
      return await fetchSoundCloudAlbumTracksPage(artistId, albumId, page);
    }
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }
    logger.warn('Album track list failed', {
      source,
      artistId,
      albumId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return null;
}

async function searchSpotifyArtists(query: string): Promise<ArtistSearchHit[]> {
  const token = await getSpotifyAppToken();
  const search = await fetchJson(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=${MAX_ARTIST_SEARCH_RESULTS}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const artists = readRecord(search, 'artists');
  const items = artists ? (readArray(artists, 'items') ?? []) : [];
  const hits: ArtistSearchHit[] = [];

  for (const item of items) {
    const artist = asRecord(item);
    const artistId = artist ? readString(artist, 'id') : null;
    const name = artist ? readString(artist, 'name') : null;
    if (!artist || !artistId || !SPOTIFY_ID_PATTERN.test(artistId) || !name) {
      continue;
    }

    const images = readArray(artist, 'images') ?? [];
    const cover = asRecord(images[0]);
    const urls = readRecord(artist, 'external_urls');
    const genres = readArray(artist, 'genres') ?? [];
    const genre = typeof genres[0] === 'string' ? genres[0] : null;

    hits.push({
      source: 'spotify',
      artistId,
      name,
      genre,
      portraitUrl: cover ? readString(cover, 'url') : null,
      pageUrl: (urls ? readString(urls, 'spotify') : null) ?? `https://open.spotify.com/artist/${artistId}`,
    });

    if (hits.length >= MAX_ARTIST_SEARCH_RESULTS) {
      break;
    }
  }

  return hits;
}

async function searchDeezerArtists(query: string): Promise<ArtistSearchHit[]> {
  const search = await fetchJson(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=${MAX_ARTIST_SEARCH_RESULTS}`,
  );
  const items = readArray(search, 'data') ?? [];
  const hits: ArtistSearchHit[] = [];

  for (const item of items) {
    const artist = asRecord(item);
    const artistId = artist ? readNumber(artist, 'id') : null;
    const name = artist ? readString(artist, 'name') : null;
    if (!artist || artistId === null || !name) {
      continue;
    }

    hits.push({
      source: 'deezer',
      artistId: String(artistId),
      name,
      genre: null,
      portraitUrl: readString(artist, 'picture_xl') ?? readString(artist, 'picture_big'),
      pageUrl: readString(artist, 'link') ?? `https://www.deezer.com/artist/${artistId}`,
    });

    if (hits.length >= MAX_ARTIST_SEARCH_RESULTS) {
      break;
    }
  }

  return hits;
}

async function searchSpotifyAlbums(query: string): Promise<AlbumSearchHit[]> {
  const token = await getSpotifyAppToken();
  const search = await fetchJson(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=${MAX_ALBUM_SEARCH_RESULTS}&market=US`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const albums = readRecord(search, 'albums');
  const items = albums ? (readArray(albums, 'items') ?? []) : [];
  const hits: AlbumSearchHit[] = [];

  for (const item of items) {
    const hit = mapSpotifyAlbumHit(item);
    if (!hit) {
      continue;
    }
    hits.push(hit);
    if (hits.length >= MAX_ALBUM_SEARCH_RESULTS) {
      break;
    }
  }

  return hits;
}

async function searchDeezerAlbums(query: string): Promise<AlbumSearchHit[]> {
  const search = await fetchJson(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=${MAX_ALBUM_SEARCH_RESULTS}`,
  );
  const items = readArray(search, 'data') ?? [];
  const hits: AlbumSearchHit[] = [];

  for (const item of items) {
    const hit = mapDeezerAlbumHit(item);
    if (!hit) {
      continue;
    }
    hits.push(hit);
    if (hits.length >= MAX_ALBUM_SEARCH_RESULTS) {
      break;
    }
  }

  return hits;
}

async function fetchSpotifyAlbumHit(albumId: string): Promise<AlbumSearchHit | null> {
  const token = await getSpotifyAppToken();
  const album = await fetchJson(`https://api.spotify.com/v1/albums/${albumId}?market=US`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return mapSpotifyAlbumHit(album);
}

async function fetchDeezerAlbumHit(albumId: string): Promise<AlbumSearchHit | null> {
  const album = await fetchJson(`https://api.deezer.com/album/${albumId}`);
  return mapDeezerAlbumHit(album);
}

function mapSpotifyAlbumHit(item: unknown): AlbumSearchHit | null {
  const album = asRecord(item);
  const albumId = album ? readString(album, 'id') : null;
  const name = album ? readString(album, 'name') : null;
  if (!album || !albumId || !SPOTIFY_ID_PATTERN.test(albumId) || !name) {
    return null;
  }

  const artists = readArray(album, 'artists') ?? [];
  const firstArtist = asRecord(artists[0]);
  const artistId = firstArtist ? readString(firstArtist, 'id') : null;
  const artistName = firstArtist ? readString(firstArtist, 'name') : null;
  if (!artistId || !SPOTIFY_ID_PATTERN.test(artistId) || !artistName) {
    return null;
  }

  const images = readArray(album, 'images') ?? [];
  const cover = asRecord(images[0]);
  const urls = readRecord(album, 'external_urls');

  return {
    source: 'spotify',
    albumId,
    artistId,
    name,
    artist: artistName,
    year: yearFromDate(readString(album, 'release_date')),
    totalTracks: readNumber(album, 'total_tracks'),
    albumType: albumTypeLabel(readString(album, 'album_type')),
    thumbnailUrl: cover ? readString(cover, 'url') : null,
    pageUrl: (urls ? readString(urls, 'spotify') : null) ?? `https://open.spotify.com/album/${albumId}`,
  };
}

function mapDeezerAlbumHit(item: unknown): AlbumSearchHit | null {
  const album = asRecord(item);
  const albumId = album ? readNumber(album, 'id') : null;
  const name = album ? (readString(album, 'title') ?? readString(album, 'name')) : null;
  if (!album || albumId === null || !name) {
    return null;
  }

  const artist = readRecord(album, 'artist');
  const artistId = artist ? readNumber(artist, 'id') : null;
  const artistName = artist ? readString(artist, 'name') : null;
  if (artistId === null || !artistName) {
    return null;
  }

  return {
    source: 'deezer',
    albumId: String(albumId),
    artistId: String(artistId),
    name,
    artist: artistName,
    year: yearFromDate(readString(album, 'release_date')),
    totalTracks: readNumber(album, 'nb_tracks'),
    albumType: albumTypeLabel(readString(album, 'record_type') ?? readString(album, 'type')),
    thumbnailUrl: readString(album, 'cover_xl') ?? readString(album, 'cover_big'),
    pageUrl: readString(album, 'link') ?? `https://www.deezer.com/album/${albumId}`,
  };
}

async function searchSpotifyArtistId(name: string): Promise<string | null> {
  const token = await getSpotifyAppToken();
  const search = await fetchJson(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const artists = readRecord(search, 'artists');
  const items = artists ? (readArray(artists, 'items') ?? []) : [];
  const artist = asRecord(items[0]);
  const artistId = artist ? readString(artist, 'id') : null;
  return artistId && SPOTIFY_ID_PATTERN.test(artistId) ? artistId : null;
}

async function fetchSpotifyArtist(artistId: string): Promise<CatalogueArtist | null> {
  const token = await getSpotifyAppToken();
  const artist = await fetchJson(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const name = readString(artist, 'name');
  if (!name) {
    return null;
  }

  const images = readArray(artist, 'images') ?? [];
  const cover = asRecord(images[0]);
  const urls = readRecord(artist, 'external_urls');

  return {
    source: 'spotify',
    artistId,
    name,
    portraitUrl: cover ? readString(cover, 'url') : null,
    pageUrl: (urls ? readString(urls, 'spotify') : null) ?? `https://open.spotify.com/artist/${artistId}`,
  };
}

async function fetchSpotifyAlbums(artistId: string, page: number): Promise<PaginatedAlbums | null> {
  const artist = await fetchSpotifyArtist(artistId);
  if (!artist) {
    return null;
  }

  const pageSize = ARTIST_ALBUMS_PAGE_SIZE;
  const token = await getSpotifyAppToken();
  let offset = Math.max(0, page - 1) * pageSize;
  let data = await fetchJson(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=${pageSize}&offset=${offset}&market=US`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const total = readNumber(data, 'total') ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const safeOffset = Math.max(0, safePage - 1) * pageSize;
  if (safeOffset !== offset && total > 0) {
    data = await fetchJson(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=${pageSize}&offset=${safeOffset}&market=US`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }
  const items = readArray(data, 'items') ?? [];
  const albums: CatalogueAlbum[] = [];

  for (const item of items) {
    const album = asRecord(item);
    const albumId = album ? readString(album, 'id') : null;
    const name = album ? readString(album, 'name') : null;
    if (!album || !albumId || !SPOTIFY_ID_PATTERN.test(albumId) || !name) {
      continue;
    }

    const images = readArray(album, 'images') ?? [];
    const cover = asRecord(images[0]);
    const urls = readRecord(album, 'external_urls');

    albums.push({
      source: 'spotify',
      albumId,
      name,
      year: yearFromDate(readString(album, 'release_date')),
      totalTracks: readNumber(album, 'total_tracks'),
      albumType: albumTypeLabel(readString(album, 'album_type')),
      thumbnailUrl: cover ? readString(cover, 'url') : null,
      pageUrl: (urls ? readString(urls, 'spotify') : null) ?? `https://open.spotify.com/album/${albumId}`,
    });
  }

  return {
    artist,
    items: albums,
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

async function fetchSpotifyAlbumTracks(
  artistId: string,
  albumId: string,
  page: number,
): Promise<AlbumTracksPage | null> {
  const token = await getSpotifyAppToken();
  const [artist, album] = await Promise.all([
    fetchSpotifyArtist(artistId),
    fetchJson(`https://api.spotify.com/v1/albums/${albumId}?market=US`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  if (!artist) {
    return null;
  }

  const name = readString(album, 'name');
  if (!name) {
    return null;
  }

  const images = readArray(album, 'images') ?? [];
  const cover = asRecord(images[0]);
  const urls = readRecord(album, 'external_urls');
  const catalogueAlbum: CatalogueAlbum = {
    source: 'spotify',
    albumId,
    name,
    year: yearFromDate(readString(album, 'release_date')),
    totalTracks: readNumber(album, 'total_tracks'),
    albumType: albumTypeLabel(readString(album, 'album_type')),
    thumbnailUrl: cover ? readString(cover, 'url') : null,
    pageUrl: (urls ? readString(urls, 'spotify') : null) ?? `https://open.spotify.com/album/${albumId}`,
  };

  const tracks = readRecord(album, 'tracks');
  const embeddedItems = tracks ? (readArray(tracks, 'items') ?? []) : [];
  const total = (tracks ? readNumber(tracks, 'total') : null) ?? catalogueAlbum.totalTracks ?? embeddedItems.length;
  const pageSize = ARTIST_TRACKS_PAGE_SIZE;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize;

  let rawTracks = embeddedItems.slice(from, to);
  if (rawTracks.length === 0 && total > embeddedItems.length) {
    const paged = await fetchJson(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=${pageSize}&offset=${from}&market=US`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    rawTracks = readArray(paged, 'items') ?? [];
  }

  return {
    artist,
    album: catalogueAlbum,
    items: rawTracks.map((item, index) => mapSpotifyTrack(item, from + index + 1)),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

function mapSpotifyTrack(item: unknown, fallbackNumber: number): CatalogueTrack {
  const track = asRecord(item);
  const id = track ? readString(track, 'id') : null;
  const durationMs = track ? readNumber(track, 'duration_ms') : null;

  return {
    name: (track ? readString(track, 'name') : null) ?? 'Unknown Title',
    trackNumber: (track ? readNumber(track, 'track_number') : null) ?? fallbackNumber,
    durationLabel: durationMs !== null ? formatDuration(Math.round(durationMs / 1000)) : null,
    url: id && SPOTIFY_ID_PATTERN.test(id) ? `https://open.spotify.com/track/${id}` : null,
  };
}

async function searchDeezerArtistId(name: string): Promise<string | null> {
  const search = await fetchJson(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`,
  );
  const items = readArray(search, 'data') ?? [];
  const artist = asRecord(items[0]);
  const artistId = artist ? readNumber(artist, 'id') : null;
  return artistId !== null ? String(artistId) : null;
}

async function fetchDeezerArtist(artistId: string): Promise<CatalogueArtist | null> {
  const artist = await fetchJson(`https://api.deezer.com/artist/${artistId}`);
  const name = readString(artist, 'name');
  if (!name) {
    return null;
  }

  return {
    source: 'deezer',
    artistId,
    name,
    portraitUrl: readString(artist, 'picture_xl') ?? readString(artist, 'picture_big'),
    pageUrl: readString(artist, 'link') ?? `https://www.deezer.com/artist/${artistId}`,
  };
}

async function fetchDeezerAlbums(artistId: string, page: number): Promise<PaginatedAlbums | null> {
  const artist = await fetchDeezerArtist(artistId);
  if (!artist) {
    return null;
  }

  const pageSize = ARTIST_ALBUMS_PAGE_SIZE;
  let offset = Math.max(0, page - 1) * pageSize;
  let data = await fetchJson(
    `https://api.deezer.com/artist/${artistId}/albums?index=${offset}&limit=${pageSize}`,
  );
  const total = readNumber(data, 'total') ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const safeOffset = Math.max(0, safePage - 1) * pageSize;
  if (safeOffset !== offset && total > 0) {
    data = await fetchJson(
      `https://api.deezer.com/artist/${artistId}/albums?index=${safeOffset}&limit=${pageSize}`,
    );
  }
  const items = readArray(data, 'data') ?? [];
  const albums: CatalogueAlbum[] = [];

  for (const item of items) {
    const album = asRecord(item);
    const albumId = album ? readNumber(album, 'id') : null;
    const name = album ? readString(album, 'title') : null;
    if (!album || albumId === null || !name) {
      continue;
    }

    albums.push({
      source: 'deezer',
      albumId: String(albumId),
      name,
      year: yearFromDate(readString(album, 'release_date')),
      totalTracks: readNumber(album, 'nb_tracks'),
      albumType: albumTypeLabel(readString(album, 'record_type')),
      thumbnailUrl: readString(album, 'cover_xl') ?? readString(album, 'cover_big'),
      pageUrl: readString(album, 'link') ?? `https://www.deezer.com/album/${albumId}`,
    });
  }

  return {
    artist,
    items: albums,
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

async function fetchDeezerAlbumTracks(
  artistId: string,
  albumId: string,
  page: number,
): Promise<AlbumTracksPage | null> {
  const pageSize = ARTIST_TRACKS_PAGE_SIZE;
  const offset = Math.max(0, page - 1) * pageSize;
  const [artist, album, tracks] = await Promise.all([
    fetchDeezerArtist(artistId),
    fetchJson(`https://api.deezer.com/album/${albumId}`),
    fetchJson(`https://api.deezer.com/album/${albumId}/tracks?index=${offset}&limit=${pageSize}`),
  ]);

  if (!artist) {
    return null;
  }

  const name = readString(album, 'title');
  if (!name) {
    return null;
  }

  const catalogueAlbum: CatalogueAlbum = {
    source: 'deezer',
    albumId,
    name,
    year: yearFromDate(readString(album, 'release_date')),
    totalTracks: readNumber(album, 'nb_tracks'),
    albumType: albumTypeLabel(readString(album, 'record_type')),
    thumbnailUrl: readString(album, 'cover_xl') ?? readString(album, 'cover_big'),
    pageUrl: readString(album, 'link') ?? `https://www.deezer.com/album/${albumId}`,
  };

  const total = readNumber(tracks, 'total') ?? catalogueAlbum.totalTracks ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const items = (readArray(tracks, 'data') ?? []).map((item, index) => {
    const track = asRecord(item);
    const duration = track ? readNumber(track, 'duration') : null;
    return {
      name: (track ? readString(track, 'title') : null) ?? 'Unknown Title',
      trackNumber: (track ? readNumber(track, 'track_position') : null) ?? offset + index + 1,
      durationLabel: duration !== null ? formatDuration(duration) : null,
      url: track ? readString(track, 'link') : null,
    };
  });

  return {
    artist,
    album: catalogueAlbum,
    items,
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

function mapSoundCloudAlbumHit(details: SoundCloudAlbumDetails | null): AlbumSearchHit | null {
  if (!details) {
    return null;
  }

  return {
    source: 'soundcloud',
    albumId: details.albumId,
    artistId: details.artistId,
    name: details.name,
    artist: details.artist,
    year: details.year,
    totalTracks: details.totalTracks,
    albumType: details.albumType,
    thumbnailUrl: details.thumbnailUrl,
    pageUrl: details.pageUrl,
  };
}

async function fetchSoundCloudAlbumTracksPage(
  artistId: string,
  albumId: string,
  page: number,
): Promise<AlbumTracksPage | null> {
  const result = await fetchSoundCloudAlbumTracks(albumId, page);
  if (!result) {
    return null;
  }

  const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / ARTIST_TRACKS_PAGE_SIZE);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  return {
    artist: {
      source: 'soundcloud',
      artistId: result.details.artistId || artistId,
      name: result.details.artist,
      portraitUrl: null,
      pageUrl: result.details.pageUrl,
    },
    album: {
      source: 'soundcloud',
      albumId: result.details.albumId,
      name: result.details.name,
      year: result.details.year,
      totalTracks: result.details.totalTracks,
      albumType: result.details.albumType,
      thumbnailUrl: result.details.thumbnailUrl,
      pageUrl: result.details.pageUrl,
    },
    items: result.tracks,
    page: safePage,
    pageSize: ARTIST_TRACKS_PAGE_SIZE,
    total: result.total,
    totalPages,
  };
}

function albumTypeLabel(value: string | null): string | null {
  switch ((value ?? '').toLowerCase()) {
    case 'album':
      return 'Album';
    case 'single':
      return 'Single';
    case 'ep':
      return 'EP';
    case 'compilation':
    case 'compile':
      return 'Compilation';
    default:
      return value;
  }
}
