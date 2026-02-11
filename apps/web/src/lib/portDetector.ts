// Strip ANSI escape codes
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

// Match http(s)://host:port patterns
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]):\d+/g;

// Hosts to normalize to localhost
const LOCALHOST_ALIASES = /127\.0\.0\.1|0\.0\.0\.0|\[::\]/g;

/**
 * Detect localhost URLs with ports from terminal output.
 * Strips ANSI codes, normalizes host aliases, deduplicates.
 */
export function detectPorts(text: string): string[] {
  const clean = text.replace(ANSI_RE, '');
  const matches = clean.match(URL_RE);
  if (!matches) return [];

  const normalized = matches.map((url) =>
    url.replace(LOCALHOST_ALIASES, 'localhost').replace(/\/+$/, '')
  );

  return [...new Set(normalized)];
}
