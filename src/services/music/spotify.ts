import { getSpotifyCredentials } from '../../config/env';
import { formatCount, yearFromDate } from '../../utils/format';
import { logger } from '../../utils/logger';
import { applyCatalogFallback } from './catalog';
import { asRecord, fetchJson, fetchText, readArray, readNumber, readRecord, readString } from './http';
import { getSpotifyAppToken } from './spotifyAuth';
import { firstKnownArtist, isUnknownArtist } from './trackCredits';
import type { MusicProvider, ParseUrlResult, ParsedSongUrl, SongInfo, SongMetadata } from './types';

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'spotify.com', 'www.spotify.com']);
const TRACK_ID_PATTERN = /^(?:\/intl-[a-z]{2})?\/track\/([A-Za-z0-9]{22})(?:\/|$)/i;
const NON_TRACK_PATTERN = /^(?:\/intl-[a-z]{2})?\/(playlist|album|artist|episode|show|user)\b/i;

function hostname(url: URL): string {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

export const spotifyProvider: MusicProvider = {
  platform: 'spotify',

  canHandle(url) {
    return SPOTIFY_HOSTS.has(url.hostname.toLowerCase()) || SPOTIFY_HOSTS.has(hostname(url));
  },

  parse(url): ParseUrlResult {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: 'invalid' };
    }

    if (NON_TRACK_PATTERN.test(url.pathname)) {
      return { ok: false, reason: 'not_a_track' };
    }

    const match = url.pathname.match(TRACK_ID_PATTERN);

    if (!match?.[1]) {
      return { ok: false, reason: 'invalid' };
    }

    const platformSongId = match[1];

    return {
      ok: true,
      song: {
        platform: 'spotify',
        platformSongId,
        canonicalUrl: `https://open.spotify.com/track/${platformSongId}`,
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
    };
  },

  async fetchInfo(song: ParsedSongUrl): Promise<SongInfo> {
    let info: SongInfo | null = null;

    if (getSpotifyCredentials()) {
      try {
        info = await fetchSpotifyApiInfo(song);
      } catch (error) {
        logger.warn('Spotify API lookup failed, using public artist profile fallback', {
          platformSongId: song.platformSongId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    if (!info || isUnknownArtist(info.artist)) {
      const embed = await fetchSpotifyEmbed(song);
      if (embed) {
        info = {
          ...song,
          title: info && !isUnknownTitle(info.title) ? info.title : (embed.title ?? 'Unknown Title'),
          artist: firstKnownArtist(info?.artist, embed.artist),
          album: info?.album ?? null,
          thumbnailUrl: info?.thumbnailUrl ?? embed.thumbnailUrl,
          releaseYear: info?.releaseYear ?? embed.releaseYear,
          audience: info?.audience ?? [],
          metadataMissing: false,
        };
      }
    }

    if (!info) {
      const oembed = await fetchOEmbed(song);
      info = {
        ...song,
        ...oembed,
        artist: firstKnownArtist(oembed.artist),
        album: null,
        releaseYear: null,
        audience: [],
        metadataMissing: false,
      };
    }

    return applyCatalogFallback(info);
  },
};

export async function fetchSpotifyProfileArtist(platformSongId: string): Promise<string | null> {
  const song: ParsedSongUrl = {
    platform: 'spotify',
    platformSongId,
    canonicalUrl: `https://open.spotify.com/track/${platformSongId}`,
  };

  if (getSpotifyCredentials()) {
    try {
      const info = await fetchSpotifyApiInfo(song);
      if (!isUnknownArtist(info.artist)) {
        return info.artist;
      }
    } catch (error) {
      logger.warn('Spotify API artist lookup failed', {
        platformSongId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  const embed = await fetchSpotifyEmbed(song);
  return embed?.artist && !isUnknownArtist(embed.artist) ? embed.artist : null;
}

async function fetchOEmbed(song: ParsedSongUrl): Promise<{
  title: string;
  artist: string;
  thumbnailUrl: string | null;
}> {
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(song.canonicalUrl)}`;
  const data = await fetchJson(oembedUrl);
  const rawTitle = readString(data, 'title') ?? 'Unknown Title';
  const author = readString(data, 'author_name');
  return {
    title: rawTitle,
    artist: firstKnownArtist(author),
    thumbnailUrl: readString(data, 'thumbnail_url'),
  };
}

async function fetchSpotifyEmbed(song: ParsedSongUrl): Promise<{
  title: string | null;
  artist: string | null;
  thumbnailUrl: string | null;
  releaseYear: string | null;
} | null> {
  try {
    const html = await fetchText(`https://open.spotify.com/embed/track/${song.platformSongId}`);
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match?.[1]) {
      return null;
    }

    const parsed: unknown = JSON.parse(match[1]);
    const root = asRecord(parsed);
    const props = root ? readRecord(root, 'props') : null;
    const pageProps = props ? readRecord(props, 'pageProps') : null;
    const state = pageProps ? readRecord(pageProps, 'state') : null;
    const data = state ? readRecord(state, 'data') : null;
    const entity = data ? readRecord(data, 'entity') : null;

    if (!entity) {
      return null;
    }

    const artists = readArray(entity, 'artists') ?? [];
    let artist: string | null = null;
    for (const item of artists) {
      const row = asRecord(item);
      const name = row ? readString(row, 'name') : null;
      if (name && !isUnknownArtist(name)) {
        artist = name;
        break;
      }
    }

    const release = readRecord(entity, 'releaseDate');
    const identity = readRecord(entity, 'visualIdentity');
    const images = identity ? (readArray(identity, 'image') ?? []) : [];
    let thumbnailUrl: string | null = null;
    let largest = 0;
    for (const item of images) {
      const image = asRecord(item);
      const url = image ? readString(image, 'url') : null;
      const width = image ? (readNumber(image, 'maxWidth') ?? 0) : 0;
      if (url && width >= largest) {
        thumbnailUrl = url;
        largest = width;
      }
    }

    return {
      title: readString(entity, 'name') ?? readString(entity, 'title'),
      artist,
      thumbnailUrl,
      releaseYear: yearFromDate(release ? readString(release, 'isoString') : null),
    };
  } catch (error) {
    logger.warn('Spotify embed artist lookup failed', {
      platformSongId: song.platformSongId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

function isUnknownTitle(title: string | null | undefined): boolean {
  const value = title?.trim() ?? '';
  return value.length === 0 || /^unknown title$/i.test(value);
}

async function fetchSpotifyApiInfo(song: ParsedSongUrl): Promise<SongInfo> {
  const token = await getSpotifyAppToken();
  const track = await fetchJson(
    `https://api.spotify.com/v1/tracks/${song.platformSongId}?market=US`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const album = readRecord(track, 'album');
  const artists = readArray(track, 'artists') ?? [];
  const firstArtist = asRecord(artists[0]);
  const images = album ? (readArray(album, 'images') ?? []) : [];
  const cover = asRecord(images[0]);
  const artistId = firstArtist ? readString(firstArtist, 'id') : null;
  const popularity = readNumber(track, 'popularity');
  const followers = artistId ? await fetchArtistFollowers(token, artistId) : null;
  const audience = [];

  if (followers !== null) {
    audience.push({ label: 'Artist followers', value: formatCount(followers) });
  }

  if (popularity !== null) {
    audience.push({ label: 'Popularity', value: `${Math.round(popularity)}/100` });
  }

  return {
    ...song,
    title: readString(track, 'name') ?? 'Unknown Title',
    artist: firstKnownArtist(firstArtist ? readString(firstArtist, 'name') : null),
    album: album ? readString(album, 'name') : null,
    thumbnailUrl: cover ? readString(cover, 'url') : null,
    releaseYear: album ? yearFromDate(readString(album, 'release_date')) : null,
    audience,
    metadataMissing: false,
  };
}

async function fetchArtistFollowers(token: string, artistId: string): Promise<number | null> {
  try {
    const artist = await fetchJson(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const followers = readRecord(artist, 'followers');
    return followers ? readNumber(followers, 'total') : null;
  } catch (error) {
    logger.warn('Spotify artist lookup failed', {
      artistId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}
