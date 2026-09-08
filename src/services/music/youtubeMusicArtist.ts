import { asRecord, fetchJson, readRecord, readString } from './http';

const YOUTUBE_MUSIC_NEXT_URL = 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false';

export async function fetchYouTubeMusicArtist(videoId: string): Promise<string | null> {
  const data = await fetchJson(YOUTUBE_MUSIC_NEXT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://music.youtube.com',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20250310.01.00',
        },
      },
      videoId,
    }),
  });

  const artists: string[] = [];
  collectMusicArtists(data, artists);
  return artists[0] ?? null;
}

function collectMusicArtists(node: unknown, artists: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectMusicArtists(item, artists);
    }
    return;
  }

  const record = asRecord(node);
  if (!record) {
    return;
  }

  const text = readString(record, 'text');
  const navigation = readRecord(record, 'navigationEndpoint');
  const browse = navigation ? readRecord(navigation, 'browseEndpoint') : null;
  const configs = browse ? readRecord(browse, 'browseEndpointContextSupportedConfigs') : null;
  const musicConfig = configs ? readRecord(configs, 'browseEndpointContextMusicConfig') : null;
  const pageType = musicConfig ? readString(musicConfig, 'pageType') : null;

  if (text && pageType === 'MUSIC_PAGE_TYPE_ARTIST' && !artists.includes(text)) {
    artists.push(text);
  }

  for (const value of Object.values(record)) {
    collectMusicArtists(value, artists);
  }
}
