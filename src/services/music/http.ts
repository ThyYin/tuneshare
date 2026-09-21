import { METADATA_TIMEOUT_MS } from '../../constants';

export class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

async function fetchJsonValue(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<unknown> {
  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TunetopiaBot/0.1',
      ...options?.headers,
    },
    body: options?.body,
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    const snippet = details.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new HttpStatusError(
      response.status,
      snippet
        ? `Request failed with status ${response.status}: ${snippet}`
        : `Request failed with status ${response.status}`,
    );
  }

  return response.json();
}

export async function fetchJson(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<Record<string, unknown>> {
  const data = await fetchJsonValue(url, options);

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Response was not a JSON object');
  }

  return data as Record<string, unknown>;
}

export async function fetchJsonArray(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<unknown[]> {
  const data = await fetchJsonValue(url, options);
  if (!Array.isArray(data)) {
    throw new Error('Response was not a JSON array');
  }
  return data;
}

export async function fetchText(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<string> {
  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'TunetopiaBot/0.1',
      ...options?.headers,
    },
    body: options?.body,
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.text();
}

export function readString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readNumber(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function readRecord(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = data[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readArray(data: Record<string, unknown>, key: string): unknown[] | null {
  const value = data[key];
  return Array.isArray(value) ? value : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
