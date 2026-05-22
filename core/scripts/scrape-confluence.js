#!/usr/bin/env node
// scripts/scrape-confluence.js
//
// CLI entry point. Reads CONFLUENCE_BASE_URL + CONFLUENCE_PAT from env, walks
// the target space, and emits a single JSON document to stdout matching
// specs/001-confluence-agent-builder/contracts/scraped-output.schema.json.
//
// Re-runs are idempotent: every invocation is a fresh scrape, no caching
// between runs (see research.md R9). Filter flags (--label, --ancestor) make
// targeted incremental refresh practical (US2).
//
// TLS verification is disabled inside the client module — see research.md R11.

import { walkSpace } from './lib/page-walker.js';
import { ConfluenceError } from './lib/confluence-client.js';

const USAGE = `Usage: node scripts/scrape-confluence.js --space <KEY> [options]

Options:
  --space <KEY>          Confluence space key. Overrides CONFLUENCE_SPACE_KEY.
  --max-depth <N>        Max ancestor depth (default 3).
  --label <name>         Only include pages with this label. Repeatable; AND semantics.
  --ancestor <pageId>    Only include descendants of this page.
  --help                 Print this message and exit 0.

Required environment variables:
  CONFLUENCE_BASE_URL    Full prefix to your on-prem Confluence (no trailing slash).
  CONFLUENCE_PAT         Personal Access Token (Bearer auth).

Output:
  JSON document on stdout (see contracts/scraped-output.schema.json).
  Progress and errors on stderr.

Exit codes: 0 ok | 1 unexpected | 2 config | 3 auth | 4 not-found
`;

function parseArgs(argv) {
  const opts = { labels: [], maxDepth: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help':
      case '-h':
        opts.help = true; break;
      case '--space':
        opts.space = argv[++i]; break;
      case '--max-depth':
        opts.maxDepth = Number(argv[++i]); break;
      case '--label':
        opts.labels.push(argv[++i]); break;
      case '--ancestor':
        opts.ancestorId = argv[++i]; break;
      default:
        throw new ConfluenceError('CONFIG', `unknown argument: ${a}`);
    }
  }
  return opts;
}

function exitCodeFor(code) {
  switch (code) {
    case 'CONFIG': return 2;
    case 'AUTH': return 3;
    case 'NOT_FOUND': return 4;
    default: return 1;
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[scrape] ERROR: ${err.message}\n`);
    process.stderr.write(USAGE);
    process.exit(exitCodeFor(err.code ?? 'CONFIG'));
  }

  if (opts.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const baseUrl = process.env.CONFLUENCE_BASE_URL?.replace(/\/+$/, '');
  if (!baseUrl) {
    process.stderr.write('[scrape] ERROR: missing required env var CONFLUENCE_BASE_URL\n');
    process.exit(2);
  }
  if (!process.env.CONFLUENCE_PAT) {
    process.stderr.write('[scrape] ERROR: missing required env var CONFLUENCE_PAT\n');
    process.exit(2);
  }

  const spaceKey = opts.space || process.env.CONFLUENCE_SPACE_KEY;
  if (!spaceKey) {
    process.stderr.write('[scrape] ERROR: --space <KEY> or CONFLUENCE_SPACE_KEY required\n');
    process.exit(2);
  }

  if (!Number.isInteger(opts.maxDepth) || opts.maxDepth < 0 || opts.maxDepth > 10) {
    process.stderr.write(`[scrape] ERROR: --max-depth must be an integer in [0, 10]; got ${opts.maxDepth}\n`);
    process.exit(2);
  }

  const startedAt = Date.now();
  try {
    const { space, pages } = await walkSpace({
      spaceKey,
      maxDepth: opts.maxDepth,
      labels: opts.labels,
      ancestorId: opts.ancestorId,
      baseUrl,
      onProgress: (msg) => process.stderr.write(`${msg}\n`),
    });

    const out = {
      space,
      scrapedAt: new Date().toISOString(),
      maxDepth: opts.maxDepth,
      pageCount: pages.length,
      pages,
    };

    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stderr.write(`[scrape] done; ${pages.length} pages in ${elapsed}s\n`);
    process.exit(0);
  } catch (err) {
    if (err instanceof ConfluenceError) {
      process.stderr.write(`[scrape] ERROR: ${err.message}\n`);
      process.exit(exitCodeFor(err.code));
    }
    process.stderr.write(`[scrape] ERROR: ${err.stack || err.message}\n`);
    process.exit(1);
  }
}

main();
