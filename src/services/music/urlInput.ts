const ZERO_WIDTH = /[\u200b\u2060\ufeff]/g;

export function flattenWrappedMusicUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^<([^>]+)>$/s, '$1').replace(ZERO_WIDTH, '').trim();
  const start = trimmed.search(/https?:\/\//i);
  if (start < 0) {
    return trimmed;
  }

  const tokens = trimmed.slice(start).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return trimmed;
  }

  let url = tokens[0];
  for (const token of tokens.slice(1)) {
    if (continuesWrappedUrl(url, token)) {
      url += token;
      continue;
    }
    break;
  }

  return url;
}

function continuesWrappedUrl(url: string, token: string): boolean {
  if (!token || token.length > 80) {
    return false;
  }

  if (url.endsWith('-') || url.endsWith('/') || url.endsWith('?') || url.endsWith('&') || url.endsWith('=')) {
    return /^[A-Za-z0-9._~%/?#&=-]+$/.test(token);
  }

  return /^[-/?#&=.]/.test(token);
}
