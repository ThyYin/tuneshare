import { MAX_SONG_URL_LENGTH } from '../../constants';
import { UserFacingError, UserMessages } from '../../utils/errors';
import { fetchAlbumSearchHit, type AlbumSearchHit, type CatalogueSource } from './artistCatalogue';
import { classifySoundCloudUrl, SOUNDCLOUD_ID_PATTERN } from './soundcloud';
import { flattenWrappedMusicUrl } from './urlInput';
import { YOUTUBE_PLAYLIST_ID_PATTERN } from './youtubeAlbum';
import { youtubeMusicProvider } from './youtubeMusic';

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'spotify.com', 'www.spotify.com']);
const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_RESOURCE =
  /^(?:\/intl-[a-z]{2})?(?:\/embed)?\/(album|track|playlist|artist|episode|show|user)\/([^/?#]+)/i;

const DEEZER_HOSTS = new Set(['deezer.com', 'www.deezer.com']);
const DEEZER_SHORT_HOSTS = new Set(['link.deezer.com', 'deezer.page.link', 'dzr.page.link']);
const DEEZER_RESOURCE = /^(?:\/[a-z]{2})?\/(album|track|playlist|artist)\/(\d{1,12})(?:\/|$)/i;

const SOUNDCLOUD_HOSTS = new Set([
  'soundcloud.com',
  'm.soundcloud.com',
  'on.soundcloud.com',
  'w.soundcloud.com',
  'api.soundcloud.com',
]);

const SHORT_LINK_HOSTS = new Set(['spotify.link', ...DEEZER_SHORT_HOSTS]);

export interface ParsedAlbumUrl {
  source: CatalogueSource;
  albumId: string;
  spotifyKind?: 'album' | 'playlist';
}

export function looksLikeAlbumInput(raw: string): boolean {
  const trimmed = flattenWrappedMusicUrl(raw);
  if (!trimmed) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  const url = toUrl(trimmed);
  if (!url) {
    return false;
  }

  const host = hostname(url);
  return (
    SPOTIFY_HOSTS.has(host) ||
    DEEZER_HOSTS.has(host) ||
    DEEZER_SHORT_HOSTS.has(host) ||
    SOUNDCLOUD_HOSTS.has(host) ||
    youtubeMusicProvider.canHandle(url) ||
    SHORT_LINK_HOSTS.has(host)
  );
}

export async function resolveAlbumFromUrl(raw: string): Promise<AlbumSearchHit> {
  const parsed = parseAlbumUrl(raw);
  const hit = await fetchAlbumSearchHit(parsed.source, parsed.albumId, parsed.spotifyKind ?? 'album');
  if (!hit) {
    throw new UserFacingError(UserMessages.albumLinkFailed);
  }
  return hit;
}

export function parseAlbumUrl(raw: string): ParsedAlbumUrl {
  const trimmed = flattenWrappedMusicUrl(raw);
  if (!trimmed || trimmed.length > MAX_SONG_URL_LENGTH) {
    throw new UserFacingError(UserMessages.albumLinkFailed);
  }

  const url = toUrl(trimmed);
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new UserFacingError(UserMessages.albumLinkFailed);
  }

  const host = hostname(url);
  if (SHORT_LINK_HOSTS.has(host)) {
    throw new UserFacingError(UserMessages.albumLinkFailed);
  }

  if (SPOTIFY_HOSTS.has(host)) {
    return parseSpotifyAlbum(url);
  }

  if (DEEZER_HOSTS.has(host)) {
    return parseDeezerAlbum(url);
  }

  if (SOUNDCLOUD_HOSTS.has(host)) {
    return parseSoundCloudAlbum(url);
  }

  if (youtubeMusicProvider.canHandle(url)) {
    return parseYouTubeAlbum(url);
  }

  throw new UserFacingError(UserMessages.unsupportedPlatform);
}

function parseSpotifyAlbum(url: URL): ParsedAlbumUrl {
  const match = url.pathname.match(SPOTIFY_RESOURCE);
  const kind = match?.[1]?.toLowerCase();
  const id = match?.[2] ?? '';

  if (kind === 'track') {
    throw new UserFacingError(UserMessages.songOnAlbumCommand);
  }

  if ((kind === 'album' || kind === 'playlist') && SPOTIFY_ID_PATTERN.test(id)) {
    return { source: 'spotify', albumId: id, spotifyKind: kind };
  }

  throw new UserFacingError(UserMessages.notAnAlbumLink);
}

function parseDeezerAlbum(url: URL): ParsedAlbumUrl {
  const match = url.pathname.match(DEEZER_RESOURCE);
  const kind = match?.[1]?.toLowerCase();
  const id = match?.[2] ?? '';

  if (kind === 'track') {
    throw new UserFacingError(UserMessages.songOnAlbumCommand);
  }

  if (kind !== 'album' || !id) {
    throw new UserFacingError(UserMessages.notAnAlbumLink);
  }

  return { source: 'deezer', albumId: id };
}

function parseYouTubeAlbum(url: URL): ParsedAlbumUrl {
  const parsed = youtubeMusicProvider.parse(url);
  if (parsed.ok) {
    throw new UserFacingError(UserMessages.songOnAlbumCommand);
  }

  const playlistId = url.searchParams.get('list');
  if (playlistId && YOUTUBE_PLAYLIST_ID_PATTERN.test(playlistId) && /\/playlist\/?$/i.test(url.pathname)) {
    return { source: 'youtube_music', albumId: playlistId };
  }

  const browseId = url.pathname.match(/^\/browse\/(MPREb_[A-Za-z0-9_-]+)(?:\/|$)/)?.[1];
  if (browseId && YOUTUBE_PLAYLIST_ID_PATTERN.test(browseId)) {
    return { source: 'youtube_music', albumId: browseId };
  }

  throw new UserFacingError(UserMessages.notAnAlbumLink);
}

function parseSoundCloudAlbum(url: URL): ParsedAlbumUrl {
  const classified = classifySoundCloudUrl(url);
  if (!classified) {
    throw new UserFacingError(UserMessages.notAnAlbumLink);
  }

  if (classified.kind === 'track') {
    throw new UserFacingError(UserMessages.songOnAlbumCommand);
  }

  const albumId = SOUNDCLOUD_ID_PATTERN.test(classified.id) ? classified.id : classified.canonicalUrl;
  return { source: 'soundcloud', albumId };
}

function hostname(url: URL): string {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}
