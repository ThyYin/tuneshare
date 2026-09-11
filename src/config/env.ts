import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill in your values.`,
    );
  }

  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export const env = {
  discordToken: requireEnv('DISCORD_TOKEN'),
  discordClientId: requireEnv('DISCORD_CLIENT_ID'),
};

export function requireSupabaseEnv(): { supabaseUrl: string; supabaseKey: string } {
  return {
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseKey: requireEnv('SUPABASE_KEY'),
  };
}

export function getSpotifyCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = optionalEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = optionalEnv('SPOTIFY_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function getYouTubeApiKey(): string | null {
  return optionalEnv('YOUTUBE_API_KEY');
}
