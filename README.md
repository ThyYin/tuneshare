# Tunetopia

A Discord bot for saving and sharing favourite songs. Users paste a Spotify or YouTube Music link, and Tunetopia keeps a personal list they can browse, filter, and look up.

## Commands

Slash commands (`/fav`) and prefix commands (`t!fav`) both work.

| Command | Prefix | What it does |
|---|---|---|
| `/help` | `t!help` | Lists every command and how to use it |
| `/ping` | `t!ping` | Checks that the bot is online |
| `/fav <song_url>` | `t!fav <link>` | Saves a Spotify or YouTube Music track |
| `/favs` | `t!favs` | Shows your favourite songs, with pages and an artist filter |
| `/view @user` | `t!view @user` | Shows someone else's favourites, with pages and an artist filter |
| `/unfav` | `t!unfav <title>` | Removes a song. Slash: pick from the list. Prefix: type a title or artist |
| `/info <song_url>` | `t!info <link>` | Cover, title, artist, album, year, and listener-style stats |
| `/topartists [user]` | `t!topartists [@user]` | Artists ranked by how many of their songs are in that user's favs |
| `/artist <artistname>` | `t!artist <name>` | Portrait, genre, born/formed year, passed/disbanded year, and a page link |

## What you need

- Node.js 20+
- A Discord bot (Developer Portal)
- A free [Supabase](https://supabase.com) project
- Optional: Spotify + YouTube keys for richer `/info` and `/artist` data

## Setup

### 1. Install

```powershell
npm install
```

### 2. Discord bot

1. [Discord Developer Portal](https://discord.com/developers/applications) → your app
2. Copy the bot **token**, **Application ID**, and your server ID
3. Invite the bot with scopes **`bot`** and **`applications.commands`**
4. Bot → Privileged Gateway Intents → turn on **MESSAGE CONTENT INTENT** (needed for `t!` prefix commands)

Enable Developer Mode in Discord (User Settings → Advanced), then right-click your server icon → Copy Server ID.

### 3. Database

1. Create a Supabase project
2. SQL Editor → paste and run `supabase/schema.sql`
3. Project Settings → API:
   - Project URL → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_KEY` (not the anon key)

### 4. Environment variables

Copy `.env.example` to `.env` and fill it in:

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

SUPABASE_URL=
SUPABASE_KEY=

SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
YOUTUBE_API_KEY=
```

No quotes, no spaces around `=`.

| Variable | Required? | Used for |
|---|---|---|
| Discord vars | Yes | Bot login and slash commands |
| Supabase vars | Yes | Saving favourites |
| Spotify vars | Optional | Better `/info` + `/artist` when Spotify allows it |
| YouTube API key | Optional | YouTube `/info` year + view counts |

### 5. Optional APIs

**YouTube Data API v3** is free (quota, not a credit card). Restrict the key to **YouTube Data API v3**.

**Spotify Web API** is also free, but new apps in Development Mode often return **403** unless the app owner has Premium and the app is set up in the [Spotify Dashboard](https://developer.spotify.com/dashboard). Tunetopia still fills Spotify `/info` using public catalogs (iTunes / Deezer) when Spotify blocks the request.

`/artist` uses Spotify when it can, then MusicBrainz, Wikipedia, and TheAudioDB. No extra keys needed for those.

### 6. Run the bot

```powershell
npm run deploy-commands
npm run dev
```

Leave `npm run dev` running. Closing that terminal takes the bot offline.

`deploy-commands` registers slash commands on your test server. Run it again whenever you add a new command.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the bot with live reload |
| `npm run deploy-commands` | Registers slash commands |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm run start` | Runs the compiled bot |

## Project layout

```
src/
  commands/     slash commands
  events/       Discord events
  services/     music, artists, database logic
  database/     Supabase client
  utils/        embeds, pagination, helpers
  config/       environment variables
supabase/
  schema.sql    database table
```

Discord commands stay thin. They call services for music metadata and database work so those pieces can change later without a rewrite.

## Notes

- Duplicates are blocked in the database: same user + platform + song id
- `/view` and `/favs` show the song URL under each title
- The artist dropdown on those lists is capped at 24 artists (Discord select limit), ranked by how many songs you have from them
- Spotify does not publish real play counts on their official API. `/info` shows YouTube views, and for Spotify it uses catalog stats when available
- Do not commit `.env`
