-- Tunetopia favourites table
-- Run this once in the Supabase SQL Editor.

create table if not exists public.favourites (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  song_title text not null,
  artist text not null,
  album text,
  platform text not null check (platform in ('spotify', 'youtube_music')),
  platform_song_id text not null,
  url text not null,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  constraint favourites_user_platform_song_unique unique (discord_user_id, platform, platform_song_id)
);

create index if not exists favourites_discord_user_created_at_idx
  on public.favourites (discord_user_id, created_at desc);

-- The Discord bot uses the service_role key, which bypasses RLS.
-- Enabling RLS with no policies keeps the anon key from reading or writing this table.
alter table public.favourites enable row level security;
