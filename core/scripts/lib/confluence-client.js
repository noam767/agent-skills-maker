// Confluence Data Center HTTP client.
//
// Auth: Bearer Personal Access Token (env CONFLUENCE_PAT).
// Base URL: env CONFLUENCE_BASE_URL — full prefix (may include context path).
//           The client appends "/rest/api/..." paths unconditionally.
// TLS:   verification disabled (rejectUnauthorized: false). See research.md R11.
//        Safe only because the deployment is air-gapped on-prem.

import { Agent } from 'node:https';

const INSECURE_AGENT = new Agent({ rejectUnauthorized: false });

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 250;

export class ConfluenceError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ConfluenceError';
    this.code = code;     // 'AUTH' | 'NOT_FOUND' | 'TRANSIENT' | 'CONFIG' | 'NETWORK'
    this.status = status; // HTTP status code, if any
  }
}

function readConfig() {
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const pat = process.env.CONFLUENCE_PAT;
  if (!baseUrl) throw new ConfluenceError('CONFIG', 'missing required env var CONFLUENCE_BASE_URL');
  if (!pat) throw new ConfluenceError('CONFIG', 'missing required env var CONFLUENCE_PAT');
  return { baseUrl: baseUrl.replace(/\/+$/, ''), pat };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

/**
 * GET a Confluence REST endpoint.
 * @param {string} path  Path beginning with "/rest/api/..." (leading slash required).
 * @param {object} [opts]
 * @param {URLSearchParams|object} [opts.query]
 * @returns {Promise<any>} Parsed JSON body.
 */
export async function get(path, { query } = {}) {
  const { baseUrl, pat } = readConfig();
  const url = new URL(baseUrl + path);
  if (query) {
    const params = query instanceof URLSearchParams ? query : new URLSearchParams(query);
    for (const [k, v] of params) url.searchParams.append(k, v);
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `${process.env.CONFLUENCE_AUTH_SCHEME ?? 'Bearer'} ${pat}`,
          'Accept': 'application/json',
        },
        // Native fetch in Node honours the `dispatcher` for undici;
        // for the global https.Agent path we use a custom Agent via the
        // `agent` option supported by node:https. Node 18 `fetch` does not
        // accept `agent` directly, so we wire it via undici when present
        // and otherwise rely on the default. To keep zero-deps we instead
        // set NODE_TLS_REJECT_UNAUTHORIZED locally for this process at
        // module import time below — see bottom of file.
      });
    } catch (err) {
      lastErr = new ConfluenceError('NETWORK', `network error fetching ${url.pathname}: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
      throw lastErr;
    }

    if (res.ok) {
      try {
        return await res.json();
      } catch (err) {
        throw new ConfluenceError('NETWORK', `invalid JSON response from ${url.pathname}: ${err.message}`, res.status);
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new ConfluenceError('AUTH', `HTTP ${res.status} from ${url.pathname} — check CONFLUENCE_PAT`, res.status);
    }
    if (res.status === 404) {
      throw new ConfluenceError('NOT_FOUND', `HTTP 404 from ${url.pathname}`, 404);
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new ConfluenceError('TRANSIENT', `HTTP ${res.status} from ${url.pathname}`, res.status);
      if (attempt < MAX_ATTEMPTS) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        const backoff = retryAfter ?? BASE_DELAY_MS * 2 ** (attempt - 1);
        await delay(backoff);
        continue;
      }
      throw lastErr;
    }

    throw new ConfluenceError('NETWORK', `unexpected HTTP ${res.status} from ${url.pathname}`, res.status);
  }
  throw lastErr;
}

/**
 * GET a binary resource (attachment download). Returns a Buffer.
 * @param {string} path  Path relative to baseUrl (e.g. "/download/attachments/...").
 * @returns {Promise<Buffer>}
 */
export async function getBinary(path) {
  const { baseUrl, pat } = readConfig();
  const url = new URL(baseUrl + path);

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `${process.env.CONFLUENCE_AUTH_SCHEME ?? 'Bearer'} ${pat}`,
          'Accept': '*/*',
        },
        redirect: 'follow',
      });
    } catch (err) {
      lastErr = new ConfluenceError('NETWORK', `network error fetching ${url.pathname}: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) { await delay(BASE_DELAY_MS * 2 ** (attempt - 1)); continue; }
      throw lastErr;
    }

    if (res.ok) {
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    }

    if (res.status === 401 || res.status === 403) {
      throw new ConfluenceError('AUTH', `HTTP ${res.status} from ${url.pathname} — check CONFLUENCE_PAT`, res.status);
    }
    if (res.status === 404) {
      throw new ConfluenceError('NOT_FOUND', `HTTP 404 from ${url.pathname}`, 404);
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new ConfluenceError('TRANSIENT', `HTTP ${res.status} from ${url.pathname}`, res.status);
      if (attempt < MAX_ATTEMPTS) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        await delay(retryAfter ?? BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
      throw lastErr;
    }
    throw new ConfluenceError('NETWORK', `unexpected HTTP ${res.status} from ${url.pathname}`, res.status);
  }
  throw lastErr;
}

// -----------------------------------------------------------------------------
// TLS verification is disabled for this process. Justification: research.md R11.
// Node's global `fetch` (undici) does not accept a per-request https.Agent,
// so we set the process-wide flag here. This module is the only sanctioned
// place to do this.
// -----------------------------------------------------------------------------
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// Reference the agent constant so a future contributor can switch to a
// per-request agent if the runtime gains support for it.
export const _insecureAgent = INSECURE_AGENT;
