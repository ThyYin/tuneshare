import { getSpotifyCredentials } from '../config/env';
import { yearFromDate } from '../utils/format';
import { logger } from '../utils/logger';
import type { CatalogueSource } from './music/artistCatalogue';
import { asRecord, fetchJson, readArray, readNumber, readRecord, readString } from './music/http';
import { getSpotifyAppToken } from './music/spotifyAuth';

export interface ArtistProfile {
  name: string;
  genre: string | null;
  bornYear: string | null;
  passedYear: string | null;
  isPerson: boolean;
  portraitUrl: string | null;
  pageUrl: string;
  sourceLabel: string;
  spotifyArtistId: string | null;
}

export async function lookupArtist(
  query: string,
  options?: { spotifyArtistId?: string | null },
): Promise<ArtistProfile | null> {
  const name = query.replace(/\s+/g, ' ').trim();

  if (!name) {
    return null;
  }

  const musicBrainz = await lookupMusicBrainz(name);
  const [wikipedia, audioDb, spotify] = await Promise.all([
    lookupWikipedia(musicBrainz?.wikipediaTitle ?? name),
    lookupAudioDb(name),
    options?.spotifyArtistId
      ? fetchSpotifyArtistById(options.spotifyArtistId)
      : lookupSpotifyArtist(name),
  ]);

  const mergedName = spotify?.name ?? musicBrainz?.name ?? audioDb?.name ?? wikipedia?.name;
  if (!mergedName) {
    return null;
  }

  const isPerson = musicBrainz?.isPerson ?? true;
  const pageUrl =
    spotify?.pageUrl ??
    musicBrainz?.pageUrl ??
    wikipedia?.pageUrl ??
    audioDb?.pageUrl ??
    `https://musicbrainz.org/search?query=${encodeURIComponent(mergedName)}&type=artist`;

  return {
    name: mergedName,
    genre: firstValue(spotify?.genre, musicBrainz?.genre, audioDb?.genre),
    bornYear: firstValue(musicBrainz?.bornYear, audioDb?.bornYear),
    passedYear: firstValue(musicBrainz?.passedYear, audioDb?.passedYear),
    isPerson,
    portraitUrl: firstValue(spotify?.portraitUrl, wikipedia?.portraitUrl, audioDb?.portraitUrl),
    pageUrl,
    sourceLabel: spotify ? 'Spotify' : musicBrainz ? 'MusicBrainz' : 'Public music databases',
    spotifyArtistId: spotify?.spotifyArtistId ?? null,
  };
}

export async function lookupArtistFromPick(
  source: CatalogueSource,
  artistId: string,
): Promise<ArtistProfile | null> {
  if (source === 'spotify') {
    const spotify = await fetchSpotifyArtistById(artistId);
    if (!spotify?.name) {
      return null;
    }

    return lookupArtist(spotify.name, { spotifyArtistId: artistId });
  }

  try {
    const artist = await fetchJson(`https://api.deezer.com/artist/${artistId}`);
    const name = readString(artist, 'name');
    if (!name) {
      return null;
    }

    return lookupArtist(name);
  } catch (error) {
    logger.warn('Deezer artist pick lookup failed', {
      artistId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

function firstValue(...values: Array<string | null | undefined>): string | null {
  return values.find((value) => value && value.trim()) ?? null;
}

async function lookupSpotifyArtist(
  name: string,
): Promise<Pick<ArtistProfile, 'name' | 'genre' | 'portraitUrl' | 'pageUrl' | 'spotifyArtistId'> | null> {
  if (!getSpotifyCredentials()) {
    return null;
  }

  try {
    const token = await getSpotifyAppToken();
    const search = await fetchJson(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const artists = readRecord(search, 'artists');
    const items = artists ? (readArray(artists, 'items') ?? []) : [];
    const artist = asRecord(items[0]);
    const artistId = artist ? readString(artist, 'id') : null;

    if (!artistId) {
      return mapSpotifyArtist(artist, name);
    }

    return (await fetchSpotifyArtistById(artistId)) ?? mapSpotifyArtist(artist, name);
  } catch (error) {
    logger.warn('Spotify artist search failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

async function fetchSpotifyArtistById(
  artistId: string,
): Promise<Pick<ArtistProfile, 'name' | 'genre' | 'portraitUrl' | 'pageUrl' | 'spotifyArtistId'> | null> {
  if (!getSpotifyCredentials() || !/^[A-Za-z0-9]{22}$/.test(artistId)) {
    return null;
  }

  try {
    const token = await getSpotifyAppToken();
    const artist = await fetchJson(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return mapSpotifyArtist(artist, null, artistId);
  } catch (error) {
    logger.warn('Spotify artist id lookup failed', {
      artistId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

function mapSpotifyArtist(
  artist: Record<string, unknown> | null,
  fallbackName: string | null,
  knownId?: string,
): Pick<ArtistProfile, 'name' | 'genre' | 'portraitUrl' | 'pageUrl' | 'spotifyArtistId'> | null {
  if (!artist) {
    return null;
  }

  const artistId = knownId ?? readString(artist, 'id');
  const images = readArray(artist, 'images') ?? [];
  const cover = asRecord(images[0]);
  const genres = readArray(artist, 'genres') ?? [];
  const genre = typeof genres[0] === 'string' ? genres[0] : null;
  const urls = readRecord(artist, 'external_urls');
  const name = readString(artist, 'name') ?? fallbackName;

  if (!name) {
    return null;
  }

  return {
    name,
    genre,
    portraitUrl: cover ? readString(cover, 'url') : null,
    pageUrl:
      (urls ? readString(urls, 'spotify') : null) ??
      (artistId ? `https://open.spotify.com/artist/${artistId}` : `https://open.spotify.com/search/${encodeURIComponent(name)}`),
    spotifyArtistId: artistId && /^[A-Za-z0-9]{22}$/.test(artistId) ? artistId : null,
  };
}

async function lookupMusicBrainz(name: string): Promise<{
  name: string;
  genre: string | null;
  bornYear: string | null;
  passedYear: string | null;
  isPerson: boolean;
  pageUrl: string;
  wikipediaTitle: string | null;
} | null> {
  try {
    const search = await fetchJson(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=5`,
      { headers: { 'User-Agent': 'TunetopiaBot/0.1 (Discord music bot)' } },
    );
    const artists = readArray(search, 'artists') ?? [];
    const first = asRecord(artists[0]);
    const mbid = first ? readString(first, 'id') : null;

    if (!first || !mbid) {
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, 900));

    const detail = await fetchJson(
      `https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres+tags+url-rels&fmt=json`,
      { headers: { 'User-Agent': 'TunetopiaBot/0.1 (Discord music bot)' } },
    );

    const lifeSpan = readRecord(detail, 'life-span');
    const genres = readArray(detail, 'genres') ?? [];
    const tags = readArray(detail, 'tags') ?? [];
    const genreName =
      pickNamedCount(genres) ?? pickNamedCount(tags);
    const type = readString(detail, 'type');
    const relations = readArray(detail, 'relations') ?? [];

    return {
      name: readString(detail, 'name') ?? readString(first, 'name') ?? name,
      genre: genreName,
      bornYear: lifeSpan ? yearFromDate(readString(lifeSpan, 'begin')) : null,
      passedYear: lifeSpan ? yearFromDate(readString(lifeSpan, 'end')) : null,
      isPerson: (type ?? readString(first, 'type')) === 'Person',
      pageUrl: `https://musicbrainz.org/artist/${mbid}`,
      wikipediaTitle: wikipediaTitleFromRelations(relations),
    };
  } catch (error) {
    logger.warn('MusicBrainz artist lookup failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

function pickNamedCount(items: unknown[]): string | null {
  const named = items
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item && readString(item, 'name')))
    .sort((a, b) => (readNumber(b, 'count') ?? 0) - (readNumber(a, 'count') ?? 0));

  return named[0] ? readString(named[0], 'name') : null;
}

function wikipediaTitleFromRelations(relations: unknown[]): string | null {
  for (const relation of relations) {
    const row = asRecord(relation);
    if (!row || readString(row, 'type') !== 'wikipedia') {
      continue;
    }

    const url = readRecord(row, 'url');
    const resource = url ? readString(url, 'resource') : null;
    if (!resource) {
      continue;
    }

    try {
      const parsed = new URL(resource);
      if (!parsed.hostname.endsWith('wikipedia.org')) {
        continue;
      }

      const title = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '');
      if (title) {
        return title.replace(/_/g, ' ');
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function lookupWikipedia(
  title: string,
): Promise<Pick<ArtistProfile, 'name' | 'portraitUrl' | 'pageUrl'> | null> {
  try {
    const slug = encodeURIComponent(title.replace(/ /g, '_'));
    const data = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
      headers: { 'User-Agent': 'TunetopiaBot/0.1 (Discord music bot)' },
    });

    const thumbnail = readRecord(data, 'thumbnail');
    const original = readRecord(data, 'originalimage');

    return {
      name: readString(data, 'title') ?? title,
      portraitUrl:
        (original ? readString(original, 'source') : null) ??
        (thumbnail ? readString(thumbnail, 'source') : null),
      pageUrl: `https://en.wikipedia.org/wiki/${slug}`,
    };
  } catch {
    return null;
  }
}

async function lookupAudioDb(name: string): Promise<{
  name: string;
  genre: string | null;
  bornYear: string | null;
  passedYear: string | null;
  portraitUrl: string | null;
  pageUrl: string | null;
} | null> {
  try {
    const data = await fetchJson(
      `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(name)}`,
    );
    const artists = readArray(data, 'artists') ?? [];
    const artist = asRecord(artists[0]);

    if (!artist) {
      return null;
    }

    const website = readString(artist, 'strWebsite');

    return {
      name: readString(artist, 'strArtist') ?? name,
      genre: readString(artist, 'strGenre'),
      bornYear: readString(artist, 'intBornYear') ?? readString(artist, 'intFormedYear'),
      passedYear: readString(artist, 'intDiedYear'),
      portraitUrl:
        readString(artist, 'strArtistThumb') ?? readString(artist, 'strArtistFanart'),
      pageUrl: website
        ? website.startsWith('http')
          ? website
          : `https://${website}`
        : null,
    };
  } catch (error) {
    logger.warn('AudioDB artist lookup failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}
