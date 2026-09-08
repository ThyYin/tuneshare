export function normalizeCredit(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namesEqual(a: string, b: string): boolean {
  const left = normalizeCredit(a);
  const right = normalizeCredit(b);
  return Boolean(left) && left === right;
}

export function artistGroupKey(name: string): string {
  return profileName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function profileName(name: string): string {
  return name.replace(/\s+-\s+topic$/i, '').replace(/vevo$/i, '').trim();
}

export function preferredArtistName(names: string[]): string {
  const cleaned = names.map(profileName).filter((name) => !isUnknownArtist(name));

  if (cleaned.length === 0) {
    return names.find((name) => !isUnknownArtist(name)) ?? names[0] ?? 'Unknown Artist';
  }

  const withSpaces = cleaned.filter((name) => /\s/.test(name));
  const pool = withSpaces.length > 0 ? withSpaces : cleaned;

  return [...pool].sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
}

export function isUnknownArtist(name: string | null | undefined): boolean {
  const value = name?.trim() ?? '';
  return value.length === 0 || /^unknown(\s+artist)?$/i.test(value);
}

export function firstKnownArtist(...names: Array<string | null | undefined>): string {
  for (const name of names) {
    const trimmed = name?.trim() ?? '';
    if (!isUnknownArtist(trimmed)) {
      return trimmed;
    }
  }

  return 'Unknown Artist';
}
