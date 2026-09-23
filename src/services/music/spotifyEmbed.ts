import { formatDuration, yearFromDate } from '../../utils/format';
import { logger } from '../../utils/logger';
import { asRecord, fetchText, readArray, readNumber, readRecord, readString } from './http';

export const SPOTIFY_PUBLIC_ARTIST_ID = '0000000000000000000000';

const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const EMBED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export type SpotifyEmbedKind = 'album' | 'playlist';

export interface SpotifyEmbedTrack {
  name: string;
  trackNumber: number;
  durationLabel: string | null;
  url: string | null;
}

export interface SpotifyEmbedCollection {
  kind: SpotifyEmbedKind;
  id: string;
  name: string;
  artist: string;
  year: string | null;
  thumbnailUrl: string | null;
  pageUrl: string;
  tracks: SpotifyEmbedTrack[];
}

export async function loadSpotifyEmbedCollection(
  kind: SpotifyEmbedKind,
  id: string,
): Promise<SpotifyEmbedCollection | null> {
  if (!SPOTIFY_ID_PATTERN.test(id)) {
    return null;
  }

  try {
    const html = await fetchText(`https://open.spotify.com/embed/${kind}/${id}`, {
      headers: { 'User-Agent': EMBED_USER_AGENT },
    });
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
    if (!entity || readString(entity, 'type') !== kind || readString(entity, 'id') !== id) {
      return null;
    }

    const name = readString(entity, 'name') ?? readString(entity, 'title');
    if (!name) {
      return null;
    }

    const release = readRecord(entity, 'releaseDate');
    return {
      kind,
      id,
      name,
      artist: readString(entity, 'subtitle') ?? 'Unknown Artist',
      year: yearFromDate(release ? readString(release, 'isoString') : null),
      thumbnailUrl: embedArtwork(entity),
      pageUrl: `https://open.spotify.com/${kind}/${id}`,
      tracks: embedTracks(readArray(entity, 'trackList') ?? []),
    };
  } catch (error) {
    logger.warn('Spotify embed lookup failed', {
      kind,
      id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

function embedArtwork(entity: Record<string, unknown>): string | null {
  const visual = readRecord(entity, 'visualIdentity');
  const images = visual ? (readArray(visual, 'image') ?? []) : [];
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

  if (thumbnailUrl) {
    return thumbnailUrl;
  }

  const cover = readRecord(entity, 'coverArt');
  const sources = cover ? (readArray(cover, 'sources') ?? []) : [];
  const first = asRecord(sources[0]);
  return first ? readString(first, 'url') : null;
}

function embedTracks(items: unknown[]): SpotifyEmbedTrack[] {
  const tracks: SpotifyEmbedTrack[] = [];
  for (const item of items) {
    const track = asRecord(item);
    const title = track ? readString(track, 'title') : null;
    if (!track || !title) {
      continue;
    }

    const uri = readString(track, 'uri');
    const trackId = uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1] ?? null;
    const durationMs = readNumber(track, 'duration');
    tracks.push({
      name: title,
      trackNumber: tracks.length + 1,
      durationLabel: durationMs && durationMs > 0 ? formatDuration(Math.round(durationMs / 1000)) : null,
      url: trackId ? `https://open.spotify.com/track/${trackId}` : null,
    });
  }
  return tracks;
}
