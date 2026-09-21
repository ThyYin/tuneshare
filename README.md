# Tunetopia

A Discord bot for saving and sharing favourite **songs and albums**. Users type a name or paste a Spotify / YouTube Music / SoundCloud **track** link, and Tunetopia keeps personal lists they can browse, filter, and look up.

It does not join voice channels or play audio.

## Commands

Slash commands (`/fav`) and prefix commands (`t!fav`) both work.

`/view` and `t!view` were removed. Use `/favs @user` or `t!favs @user` instead.

| Command | Prefix | What it does |
|---|---|---|
| `/fav <song>` | `t!fav <name or link>` | Saves a song by name or Spotify / YouTube Music / SoundCloud track link. Name search shows the top 5 + a red **Cancel** |
| `/favs [user]` | `t!favs [@user]` | Favourite songs, with pages and an artist filter. Leave blank for yourself, or tag someone to peek |
| `/unfav [song]` | `t!unfav [title]` | Removes a song. Blank = browse your list (artist filter + red **Cancel**). Typed title = search your favs the same way. Slash also has autocomplete |
| `/favab <album>` | `t!favab <album>` | Saves an album by name. Top 5 picks + a red **Cancel** |
| `/favsab [user]` | `t!favsab [@user]` | Favourite albums, with pages and an artist filter. Same optional `@user` as `/favs` |
| `/unfavab [album]` | `t!unfavab [title]` | Removes an album. Same browse / search / artist filter / red **Cancel** pattern as `/unfav` |
| `/song <song>` | `t!song <name or link>` | Cover, title, artist, album, year, and listener-style stats |
| `/album <album>` | `t!album <album>` | Top 5 album search + red **Cancel**, then that album's tracklist |
| `/topartists [user]` | `t!topartists [@user]` | Artists ranked by how many of their songs are in that user's song favs |
| `/artist <artistname>` | `t!artist <name>` | Top 5 artist picker + red **Cancel**, then portrait, genre, years, and a page link |
| `/catalog <artistname>` | `t!catalog <name>` | Same artist picker, then albums → songs. **Back** on a tracklist is blue and returns to albums |
| `/help` | `t!help` | Lists every command and how to use it |
| `/ping` | `t!ping` | Checks that the bot is online |

| Songs | Albums |
|---|---|
| `/fav`, `/unfav`, `/favs [user]` | `/favab`, `/unfavab`, `/favsab [user]` |
| `/song` | `/album` |

## What you need

- Node.js 20+
- A Discord bot (Developer Portal)
- A free [Supabase](https://supabase.com) project
- Optional: Spotify + YouTube keys for richer lookups. Album search, `/album`, `/favab`, and `/catalog` try Spotify first, then fall back to Deezer (no Deezer key). SoundCloud **track** links work without extra keys

## Setup

### 1. Install

```powershell
npm install
```

### 2. Discord bot

1. [Discord Developer Portal](https://discord.com/developers/applications) → your app
2. Copy the bot **token** and **Application ID**
3. Invite the bot with scopes **`bot`** and **`applications.commands`**
4. Bot → Privileged Gateway Intents → turn on **MESSAGE CONTENT INTENT** (needed for `t!` prefix commands)

### 3. Database

1. Create a Supabase project
2. SQL Editor → paste and run `supabase/schema.sql`
3. If the tables already existed, still run the whole file — the statements at the bottom add SoundCloud to the platform checks (needed or SoundCloud saves will fail)
4. Project Settings → API:
   - Project URL → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_KEY` (not the anon key)

### 4. Environment variables

Copy `.env.example` to `.env` and fill it in:

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=

SUPABASE_URL=
SUPABASE_KEY=

SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
YOUTUBE_API_KEY=
```

No quotes, no spaces around `=`.

| Variable | Required? | Used for |
|---|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | Yes | Bot login and slash commands |
| Supabase vars | Yes | Saving song and album favourites |
| Spotify vars | Optional | Better `/song` + `/artist`, plus album search / catalogue / `/favab` (Deezer is the fallback) |
| YouTube API key | Optional | YouTube `/song` year + view counts |

### 5. Optional APIs

**YouTube Data API v3** is free (quota, not a credit card). Restrict the key to **YouTube Data API v3**.

**Spotify Web API** is also free, but new apps in Development Mode often return **403** unless the app owner has Premium and the app is set up in the [Spotify Dashboard](https://developer.spotify.com/dashboard). Tunetopia still fills Spotify `/song` using public catalogs (iTunes / Deezer) when Spotify blocks the request. Album search and artist catalogues also fall back to Deezer.

`/artist` bios use Spotify when they can, then MusicBrainz, Wikipedia, and TheAudioDB. No extra keys needed for those.

### 6. Run the bot

```powershell
npm run deploy-commands
npm run dev
```

Leave `npm run dev` running. Closing that terminal takes the bot offline.

`deploy-commands` registers slash commands globally, so they work in every server the bot is in. Discord can take up to an hour to show them everywhere. Run it again whenever you add, remove, or rename a command (for example after dropping `/view`).

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
  commands/     slash + prefix commands
  events/       Discord events (buttons, menus, messages)
  services/     music, artists, song/album favourites
  database/     Supabase client
  utils/        embeds, pickers, pagination, helpers
  config/       environment variables
supabase/
  schema.sql    favourites + favourite_albums tables
```

Discord commands stay thin. They call services for music metadata and database work so those pieces can change later without a rewrite.

User-facing command copy also lives in `test.md`.

## Notes

- Duplicates are blocked in the database: same user + platform + song id, and same user + platform + album id
- Song links: Spotify, YouTube Music, SoundCloud **tracks**. Album and playlist links won't save on `/fav` — use `/favab` with an album name instead
- `/favs` and `/favsab` show the source URL under each title
- Artist dropdowns are capped at 24 artists (Discord select limit), ranked by how many songs or albums you have from them
- Search pickers (songs, albums, artists) show up to 5 results and a red **Cancel**. Only the person who ran the command can use those buttons
- `/catalog` tracklists have a blue **Back** button to the album list. `/album` tracklists do not (you came from album search, not an artist)
- Spotify does not publish real play counts on their official API. `/song` shows YouTube views, and for Spotify it uses catalog stats when available
- Do not commit `.env`
