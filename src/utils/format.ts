export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.trunc(value));
}

export function yearFromDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})/);
  return match?.[1] ?? null;
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
