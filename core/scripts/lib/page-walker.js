// Depth-limited BFS over a Confluence Data Center space.
// Uses the v1 REST `/rest/api/content` endpoint with expand parameters that
// fold body, ancestors, and labels into a single round-trip per page page.

import { get, ConfluenceError } from './confluence-client.js';
import { normalize } from './content-normalizer.js';

const PAGE_SIZE = 50;
const EXPAND = 'body.storage,ancestors,metadata.labels';

/**
 * @typedef {object} WalkerOptions
 * @property {string} spaceKey
 * @property {number} [maxDepth=3]
 * @property {string[]} [labels]          AND-semantics if multiple supplied.
 * @property {string} [ancestorId]
 * @property {string} baseUrl             Used to build absolute page URLs.
 * @property {(msg: string) => void} [onProgress]  Stderr-bound progress sink.
 */

/**
 * @param {WalkerOptions} opts
 * @returns {Promise<{space: {key: string, name: string, baseUrl: string}, pages: object[]}>}
 */
export async function walkSpace(opts) {
  const {
    spaceKey,
    maxDepth = 3,
    labels = [],
    ancestorId,
    baseUrl,
    onProgress = () => {},
  } = opts;

  // 1. Fetch space metadata (also serves as auth + existence check).
  const spaceMeta = await fetchSpace(spaceKey);
  onProgress(`[scrape] space=${spaceKey} name="${spaceMeta.name}" maxDepth=${maxDepth}`);

  // 2. Page through content.
  const accepted = [];
  let start = 0;
  let total = null;
  let fetched = 0;

  while (true) {
    const batch = await fetchContentBatch(spaceKey, start, PAGE_SIZE);
    if (total == null) {
      total = typeof batch.size === 'number' && typeof batch.start === 'number'
        ? null // size is page size, not total; use _links.next as the signal
        : null;
    }
    const results = batch.results ?? [];
    if (results.length === 0) break;

    for (const raw of results) {
      fetched += 1;
      const page = toPage(raw, baseUrl);
      onProgress(`[scrape] fetched page ${fetched}: ${page.title}`);

      if (page.depth > maxDepth) continue;
      if (ancestorId && !raw.ancestors?.some((a) => String(a.id) === String(ancestorId))) continue;
      if (labels.length > 0 && !labels.every((l) => page.labels.includes(l))) continue;
      if (!page.text) continue;

      accepted.push(page);
    }

    if (!batch._links || !batch._links.next) break;
    start += results.length;
  }

  // BFS-ish ordering: depth ascending, then id ascending.
  accepted.sort((a, b) => a.depth - b.depth || Number(a.id) - Number(b.id));

  return {
    space: { key: spaceKey, name: spaceMeta.name, baseUrl },
    pages: accepted,
  };
}

async function fetchSpace(spaceKey) {
  if (!/^[A-Z0-9~]{1,255}$/.test(spaceKey)) {
    throw new ConfluenceError('CONFIG', `invalid space key "${spaceKey}" (must match /^[A-Z0-9~]{1,255}$/)`);
  }
  try {
    return await get(`/rest/api/space/${encodeURIComponent(spaceKey)}`);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      throw new ConfluenceError('NOT_FOUND', `space "${spaceKey}" not found (HTTP 404)`, 404);
    }
    throw err;
  }
}

function fetchContentBatch(spaceKey, start, limit) {
  return get('/rest/api/content', {
    query: {
      spaceKey,
      type: 'page',
      status: 'current',
      expand: EXPAND,
      start: String(start),
      limit: String(limit),
    },
  });
}

function toPage(raw, baseUrl) {
  const ancestors = (raw.ancestors ?? []).map((a) => a.title).filter(Boolean);
  const path = [...ancestors, raw.title];
  const depth = Math.max(0, path.length - 1);
  const labels = (raw.metadata?.labels?.results ?? []).map((l) => l.name).filter(Boolean);
  const storage = raw.body?.storage?.value ?? '';
  const text = normalize(storage);
  const webUi = raw._links?.webui ?? '';
  const url = webUi ? `${baseUrl}${webUi}` : '';

  return {
    id: String(raw.id),
    title: raw.title ?? '(untitled)',
    path,
    depth,
    labels,
    url,
    text,
  };
}
