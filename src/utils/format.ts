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
