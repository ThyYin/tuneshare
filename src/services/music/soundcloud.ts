import { ARTIST_TRACKS_PAGE_SIZE } from '../../constants';
import { formatCount, formatDuration, yearFromDate } from '../../utils/format';
import { UserFacingError, UserMessages } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
  asRecord,
  fetchJson,
  fetchJsonArray,
  fetchText,
  HttpStatusError,
  readArray,
  readNumber,
  readRecord,
  readString,
} from './http';
import type { MusicProvider, ParseUrlResult, ParsedSongUrl, SongInfo, SongMetadata } from './types';
import { flattenWrappedMusicUrl } from './urlInput';

export const SOUNDCLOUD_ID_PATTERN = /^\d{1,18}$/;

export interface SoundCloudAlbumDetails {
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

export interface SoundCloudAlbumTrack {
  name: string;
  trackNumber: number;
  durationLabel: string | null;
  url: string | null;
}

export interface SoundCloudAlbumTracksPage {
  details: SoundCloudAlbumDetails;
  tracks: SoundCloudAlbumTrack[];
  total: number;
}

const SOUNDCLOUD_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SOUNDCLOUD_HOSTS = new Set([
  'soundcloud.com',
  'm.soundcloud.com',
  'www.soundcloud.com',
  'on.soundcloud.com',
  'w.soundcloud.com',
  'api.soundcloud.com',
]);
const RESERVED_PATHS = new Set([
  'discover',
  'you',
  'stream',
  'search',
  'upload',
  'pages',
  'groups',
  'charts',
  'likes',
  'tracks',
  'albums',
  'sets',
  'reposts',
  'followers',
  'following',
  'comments',
  'stations',
  'premium',
  'settings',
  'messages',
  'notifications',
  'people',
  'feed',
  'home',
  'login',
  'signup',
  'logout',
  'about',
  'jobs',
  'terms',
  'privacy',
  'imprint',
  'mobile',
  'apps',
  'partners',
  'creators',
  'ads',
  'go',
  'widget',
  'player',
  'visual',
  'download',
  'library',
  'explore',
]);
const JSON_HEADERS = {
  Accept: 'application/json',
  Origin: 'https://soundcloud.com',
  Referer: 'https://soundcloud.com',
  'User-Agent': SOUNDCLOUD_UA,
};

let cachedClientId: { value: string; expiresAt: number } | null = null;
let clientIdPromise: Promise<string | null> | null = null;

function hostname(url: URL): string {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

export const soundcloudProvider: MusicProvider = {
  platform: 'soundcloud',

  canHandle(url) {
    return SOUNDCLOUD_HOSTS.has(hostname(url));
  },

  parse(url): ParseUrlResult {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: 'invalid' };
    }

    const parsed = parseSoundCloudPath(url);
    if (!parsed) {
      return { ok: false, reason: 'invalid' };
    }
    if (parsed.kind === 'playlist') {
      return { ok: false, reason: 'not_a_track' };
    }

    return {
      ok: true,
      song: {
        platform: 'soundcloud',
        platformSongId: parsed.id,
        canonicalUrl: parsed.canonicalUrl,
      },
    };
  },

  async fetchMetadata(song: ParsedSongUrl): Promise<SongMetadata> {
    const info = await this.fetchInfo(song);
    return {
      title: info.title,
      artist: info.artist,
      album: info.album,
      thumbnailUrl: info.thumbnailUrl,
      resolvedPlatformSongId: info.platformSongId,
      resolvedCanonicalUrl: info.canonicalUrl,
    };
  },

  async fetchInfo(song: ParsedSongUrl): Promise<SongInfo> {
    const resource = await resolveSoundCloudResource(song.canonicalUrl, song.platformSongId);
    if (readString(resource, 'kind') !== 'track') {
      throw new UserFacingError(UserMessages.notATrack);
    }

    const mapped = mapSoundCloudTrack(resource, song);
    if (!mapped) {
      throw new Error('SoundCloud track payload was missing title');
    }
    return mapped;
  },
};

export async function fetchSoundCloudAlbumDetails(idOrUrl: string): Promise<SoundCloudAlbumDetails | null> {
  const resource = await loadSoundCloudPlaylist(idOrUrl);
  if (!resource) {
    return null;
  }
  if (readString(resource, 'kind') === 'track') {
    throw new UserFacingError(UserMessages.albumNotFound);
  }
  return mapPlaylistDetails(resource);
}

export async function fetchSoundCloudAlbumTracks(
  albumId: string,
  page: number,
  pageSize: number = ARTIST_TRACKS_PAGE_SIZE,
): Promise<SoundCloudAlbumTracksPage | null> {
  const resource = await loadSoundCloudPlaylist(albumId);
  const details = resource ? mapPlaylistDetails(resource) : null;
  if (!resource || !details) {
    return null;
  }

  const rawTracks = await hydratePlaylistTracks(readArray(resource, 'tracks') ?? []);
  const total = details.totalTracks ?? rawTracks.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const from = Math.max(0, (safePage - 1) * pageSize);
  const tracks = rawTracks.slice(from, from + pageSize).map((track, index) => mapAlbumTrack(track, from + index + 1));

  return { details, tracks, total };
}

function parseSoundCloudPath(
  url: URL,
): { kind: 'track' | 'playlist' | 'unknown'; id: string; canonicalUrl: string } | null {
  const host = hostname(url);

  if (host === 'on.soundcloud.com') {
    const code = url.pathname.split('/').filter(Boolean)[0];
    if (!code) {
      return null;
    }
    return {
      kind: 'unknown',
      id: `short:${code}`,
      canonicalUrl: `https://on.soundcloud.com/${code}`,
    };
  }

  if (host === 'w.soundcloud.com' || host === 'api.soundcloud.com') {
    return parseSoundCloudApiTarget(url);
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const user = segments[0]?.toLowerCase() ?? '';
  if (RESERVED_PATHS.has(user)) {
    return null;
  }

  if (segments.length === 1) {
    return null;
  }

  if (segments[1]?.toLowerCase() === 'sets') {
    const slug = segments[2];
    if (!slug || RESERVED_PATHS.has(slug.toLowerCase())) {
      return null;
    }
    return {
      kind: 'playlist',
      id: `${segments[0]}/sets/${slug}`,
      canonicalUrl: `https://soundcloud.com/${segments[0]}/sets/${slug}`,
    };
  }

  const trackSlug = segments[1];
  if (!trackSlug || RESERVED_PATHS.has(trackSlug.toLowerCase())) {
    return null;
  }

  return {
    kind: 'track',
    id: `${segments[0]}/${trackSlug}`,
    canonicalUrl: `https://soundcloud.com/${segments[0]}/${trackSlug}`,
  };
}

function parseSoundCloudApiTarget(
  url: URL,
): { kind: 'track' | 'playlist' | 'unknown'; id: string; canonicalUrl: string } | null {
  const embedded = url.searchParams.get('url');
  if (embedded) {
    try {
      return parseSoundCloudApiTarget(new URL(embedded));
    } catch {
      return null;
    }
  }

  const match = url.pathname.match(/^\/(tracks|playlists)\/(\d{1,18})(?:\/|$)/i);
  if (!match?.[2]) {
    return null;
  }

  const kind = match[1].toLowerCase() === 'playlists' ? 'playlist' : 'track';
  const id = match[2];
  return {
    kind,
    id,
    canonicalUrl:
      kind === 'playlist' ? `https://api.soundcloud.com/playlists/${id}` : `https://api.soundcloud.com/tracks/${id}`,
  };
}

async function resolveSoundCloudResource(canonicalUrl: string, platformSongId: string): Promise<Record<string, unknown>> {
  const cleaned = flattenWrappedMusicUrl(canonicalUrl);
  if (SOUNDCLOUD_ID_PATTERN.test(platformSongId)) {
    try {
      return await soundCloudGet(`/tracks/${platformSongId}`);
    } catch (error) {
      logger.warn('SoundCloud track id lookup failed, resolving URL instead', {
        platformSongId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return resolveSoundCloud(cleaned);
}

async function loadSoundCloudPlaylist(idOrUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const resource = SOUNDCLOUD_ID_PATTERN.test(idOrUrl)
      ? await soundCloudGet(`/playlists/${idOrUrl}`)
      : await resolveSoundCloud(idOrUrl.startsWith('http') ? idOrUrl : `https://soundcloud.com/${idOrUrl}`);

    const kind = readString(resource, 'kind');
    if (kind === 'track') {
      throw new UserFacingError(UserMessages.albumNotFound);
    }
    return kind === 'playlist' ? resource : null;
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }
    logger.warn('SoundCloud playlist lookup failed', {
      idOrUrl,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

async function resolveSoundCloud(targetUrl: string): Promise<Record<string, unknown>> {
  const cleaned = flattenWrappedMusicUrl(targetUrl);

  try {
    return await soundCloudGet(`/resolve?url=${encodeURIComponent(cleaned)}`);
  } catch (error) {
    logger.warn('SoundCloud resolve failed, trying profile fallback', {
      targetUrl: cleaned,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  const fromProfile = await resolveViaUserCatalog(cleaned);
  if (fromProfile) {
    return fromProfile;
  }

  try {
    return await resolveViaOEmbed(cleaned);
  } catch (error) {
    logger.warn('SoundCloud oEmbed fallback failed', {
      targetUrl: cleaned,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  throw new UserFacingError(UserMessages.soundcloudNotFound);
}

async function resolveViaUserCatalog(targetUrl: string): Promise<Record<string, unknown> | null> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return null;
  }

  const parsed = parseSoundCloudPath(url);
  if (!parsed || parsed.kind === 'unknown') {
    return null;
  }

  const [userPermalink, , playlistSlug] = parsed.id.split('/');
  const trackSlug = parsed.kind === 'track' ? parsed.id.split('/')[1] : null;
  if (!userPermalink) {
    return null;
  }

  try {
    const user = await soundCloudGet(`/resolve?url=${encodeURIComponent(`https://soundcloud.com/${userPermalink}`)}`);
    const userId = readNumber(user, 'id');
    if (userId === null) {
      return null;
    }

    if (parsed.kind === 'playlist') {
      const playlists = await listSoundCloudCollection(`/users/${userId}/playlists?limit=50`);
      return pickMatchingPermalink(playlists, playlistSlug ?? parsed.id);
    }

    const tracks = await listSoundCloudCollection(`/users/${userId}/tracks?limit=50`);
    return pickMatchingPermalink(tracks, trackSlug ?? parsed.id);
  } catch (error) {
    logger.warn('SoundCloud profile fallback failed', {
      targetUrl,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

async function listSoundCloudCollection(firstPath: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let path = firstPath;

  for (let page = 0; page < 6; page += 1) {
    const data = await soundCloudGet(path);
    const batch = (readArray(data, 'collection') ?? [])
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
    items.push(...batch);

    const next = readString(data, 'next_href');
    if (!next || batch.length === 0) {
      break;
    }
    path = next;
  }

  return items;
}

function pickMatchingPermalink(items: Record<string, unknown>[], wantedSlug: string): Record<string, unknown> | null {
  const wanted = wantedSlug.trim().toLowerCase();
  if (!wanted) {
    return null;
  }

  const exact = items.find((item) => readString(item, 'permalink')?.toLowerCase() === wanted);
  if (exact) {
    return exact;
  }

  let best: { item: Record<string, unknown>; score: number } | null = null;
  for (const item of items) {
    const slug = readString(item, 'permalink')?.toLowerCase();
    if (!slug) {
      continue;
    }

    const score = sharedPrefixLength(wanted, slug);
    const shorter = Math.min(wanted.length, slug.length);
    if (score < 12 || shorter === 0 || score / shorter < 0.8) {
      continue;
    }

    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best?.item ?? null;
}

function sharedPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

async function resolveViaOEmbed(targetUrl: string): Promise<Record<string, unknown>> {
  const oembed = await fetchJson(
    `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(targetUrl)}`,
    { headers: JSON_HEADERS },
  );
  const html = readString(oembed, 'html') ?? '';
  const playlistId = html.match(/api\.soundcloud\.com(?:%2F|\/)playlists(?:%2F|\/)(\d+)/i)?.[1];
  const trackId = html.match(/api\.soundcloud\.com(?:%2F|\/)tracks(?:%2F|\/)(\d+)/i)?.[1];
  const title = stripOEmbedTitle(readString(oembed, 'title'), readString(oembed, 'author_name'));

  if (playlistId) {
    return {
      kind: 'playlist',
      id: Number(playlistId),
      title,
      permalink_url: targetUrl,
      artwork_url: readString(oembed, 'thumbnail_url'),
      user: { username: readString(oembed, 'author_name'), id: null },
      tracks: [],
    };
  }

  if (trackId) {
    return {
      kind: 'track',
      id: Number(trackId),
      title,
      permalink_url: targetUrl,
      artwork_url: readString(oembed, 'thumbnail_url'),
      user: { username: readString(oembed, 'author_name'), id: null },
    };
  }

  throw new Error('SoundCloud oEmbed did not include a track or playlist id');
}

async function hydratePlaylistTracks(tracks: unknown[]): Promise<Record<string, unknown>[]> {
  const records = tracks.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
  const missingIds = records
    .filter((track) => !readString(track, 'title'))
    .map((track) => readNumber(track, 'id'))
    .filter((id): id is number => id !== null);

  if (missingIds.length === 0) {
    return records;
  }

  const hydrated = new Map<number, Record<string, unknown>>();
  for (let index = 0; index < missingIds.length; index += 50) {
    const batch = missingIds.slice(index, index + 50);
    try {
      const items = await soundCloudGetArray(`/tracks?ids=${batch.join(',')}`);
      for (const item of items) {
        const track = asRecord(item);
        const id = track ? readNumber(track, 'id') : null;
        if (track && id !== null) {
          hydrated.set(id, track);
        }
      }
    } catch (error) {
      logger.warn('SoundCloud stub track hydrate failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return records.map((track) => {
    const id = readNumber(track, 'id');
    if (readString(track, 'title') || id === null) {
      return track;
    }
    return hydrated.get(id) ?? track;
  });
}

function mapSoundCloudTrack(resource: Record<string, unknown>, song: ParsedSongUrl): SongInfo | null {
  const title = readString(resource, 'title');
  if (!title) {
    return null;
  }

  const user = readRecord(resource, 'user');
  const publisher = readRecord(resource, 'publisher_metadata');
  const artist =
    (publisher ? readString(publisher, 'artist') : null) ??
    (user ? readString(user, 'username') : null) ??
    'Unknown Artist';
  const id = readNumber(resource, 'id');
  const canonicalUrl = readString(resource, 'permalink_url') ?? song.canonicalUrl;
  const plays = readNumber(resource, 'playback_count');
  const likes = readNumber(resource, 'likes_count');
  const audience = [
    plays !== null ? { label: 'Plays', value: formatCount(plays) } : null,
    likes !== null ? { label: 'Likes', value: formatCount(likes) } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return {
    platform: 'soundcloud',
    platformSongId: id !== null ? String(id) : song.platformSongId,
    canonicalUrl,
    title,
    artist,
    album: publisher ? readString(publisher, 'album_title') : null,
    thumbnailUrl: upgradeArtwork(readString(resource, 'artwork_url')) ?? readString(resource, 'artwork_url'),
    releaseYear: yearFromDate(readString(resource, 'release_date') ?? readString(resource, 'created_at') ?? readString(resource, 'display_date')),
    audience,
    metadataMissing: false,
  };
}

function mapPlaylistDetails(resource: Record<string, unknown>): SoundCloudAlbumDetails | null {
  const albumId = readNumber(resource, 'id');
  const name = readString(resource, 'title');
  if (albumId === null || !name) {
    return null;
  }

  const user = readRecord(resource, 'user');
  const artistId = user ? readNumber(user, 'id') : null;
  const setType = readString(resource, 'set_type');
  const isAlbum = resource.is_album === true;

  return {
    albumId: String(albumId),
    artistId: artistId !== null ? String(artistId) : '0',
    name,
    artist: (user ? readString(user, 'username') : null) ?? 'Unknown Artist',
    year: yearFromDate(readString(resource, 'release_date') ?? readString(resource, 'created_at') ?? readString(resource, 'display_date')),
    totalTracks: readNumber(resource, 'track_count'),
    albumType: albumTypeLabel(setType, isAlbum),
    thumbnailUrl: upgradeArtwork(readString(resource, 'artwork_url')),
    pageUrl: readString(resource, 'permalink_url') ?? `https://soundcloud.com/playlists/${albumId}`,
  };
}

function mapAlbumTrack(track: Record<string, unknown>, trackNumber: number): SoundCloudAlbumTrack {
  const durationMs = readNumber(track, 'duration');
  return {
    name: readString(track, 'title') ?? 'Unknown Title',
    trackNumber,
    durationLabel: durationMs !== null ? formatDuration(Math.round(durationMs / 1000)) : null,
    url: readString(track, 'permalink_url'),
  };
}

function albumTypeLabel(setType: string | null, isAlbum: boolean): string {
  switch ((setType ?? '').toLowerCase()) {
    case 'album':
      return 'Album';
    case 'ep':
      return 'EP';
    case 'single':
      return 'Single';
    case 'compilation':
      return 'Compilation';
    default:
      return isAlbum ? 'Album' : 'Playlist';
  }
}

function upgradeArtwork(url: string | null): string | null {
  if (!url) {
    return null;
  }
  return url.replace('-large.', '-t500x500.').replace('-crop.', '-t500x500.');
}

function stripOEmbedTitle(title: string | null, artist: string | null): string {
  if (!title) {
    return 'Unknown Title';
  }
  if (artist && title.toLowerCase().endsWith(` by ${artist.toLowerCase()}`)) {
    return title.slice(0, title.length - artist.length - 4).trim();
  }
  return title;
}

async function soundCloudGet(path: string, clientId?: string): Promise<Record<string, unknown>> {
  const id = clientId ?? (await requireClientId());
  try {
    return await fetchJson(soundCloudApiUrl(path, id), { headers: JSON_HEADERS });
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 401) {
      cachedClientId = null;
      const retryId = await requireClientId();
      return fetchJson(soundCloudApiUrl(path, retryId), { headers: JSON_HEADERS });
    }
    throw error;
  }
}

async function soundCloudGetArray(path: string): Promise<unknown[]> {
  const id = await requireClientId();
  try {
    return await fetchJsonArray(soundCloudApiUrl(path, id), { headers: JSON_HEADERS });
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 401) {
      cachedClientId = null;
      const retryId = await requireClientId();
      return fetchJsonArray(soundCloudApiUrl(path, retryId), { headers: JSON_HEADERS });
    }
    throw error;
  }
}

function soundCloudApiUrl(path: string, clientId: string): string {
  const joined = path.startsWith('http') ? path : `https://api-v2.soundcloud.com${path}`;
  const url = new URL(joined);
  url.searchParams.set('client_id', clientId);
  return url.toString();
}

async function requireClientId(): Promise<string> {
  const clientId = await getSoundCloudClientId();
  if (!clientId) {
    throw new Error('Could not obtain a SoundCloud client id');
  }
  return clientId;
}

async function getSoundCloudClientId(): Promise<string | null> {
  if (cachedClientId && Date.now() < cachedClientId.expiresAt) {
    return cachedClientId.value;
  }

  if (!clientIdPromise) {
    clientIdPromise = scrapeSoundCloudClientId()
      .catch((error) => {
        logger.warn('SoundCloud client id scrape failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
        return null;
      })
      .finally(() => {
        clientIdPromise = null;
      });
  }

  const value = await clientIdPromise;
  if (value) {
    cachedClientId = { value, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  }
  return value;
}

async function scrapeSoundCloudClientId(): Promise<string | null> {
  const html = await fetchText('https://soundcloud.com', {
    headers: { 'User-Agent': SOUNDCLOUD_UA, Accept: 'text/html' },
  });
  const scripts = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"' ]+\.js/g)].map((match) => match[0]);

  for (const src of scripts.reverse()) {
    try {
      const js = await fetchText(src, { headers: { 'User-Agent': SOUNDCLOUD_UA, Accept: '*/*' } });
      const match = js.match(/client_id["':=]+([A-Za-z0-9]{32})/);
      if (match?.[1]) {
        return match[1];
      }
    } catch (error) {
      logger.warn('SoundCloud asset download failed', {
        src,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return null;
}
