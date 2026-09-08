import { getSpotifyCredentials } from '../../config/env';
import { fetchJson, readNumber, readString } from './http';

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getSpotifyAppToken(): Promise<string> {
  const credentials = getSpotifyCredentials();

  if (!credentials) {
    throw new Error('Spotify API credentials are not configured');
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const basicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
  const data = await fetchJson('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const accessToken = readString(data, 'access_token');
  const expiresIn = readNumber(data, 'expires_in') ?? 3600;

  if (!accessToken) {
    throw new Error('Spotify token response did not include access_token');
  }

  cachedToken = {
    accessToken,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000,
  };

  return accessToken;
}
