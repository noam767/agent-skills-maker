// Fetches Confluence page attachments and, when host tooling is available,
// extracts their textual content for the KnowledgeSummary step.
//
// DEPLOYMENT: on-prem Confluence Data Center / Server only (air-gapped). DC
// accepts PAT/Bearer auth on both /rest/api/ and /download/ paths, so
// attachment downloads "just work" with the same token used for the REST
// listing — no extra auth dance.
//
// AIR-GAP RULES (research.md R11 + the on-prem deployment context):
//   - Zero npm dependencies. Only Node stdlib + binaries already on PATH.
//   - Never `npm install`, never network-egress to OCR/parsing services.
//   - For PDFs: shell out to `pdftotext` (poppler-utils or XPDF) IF present.
//   - For images: shell out to `tesseract` (tesseract-ocr) IF present.
//   - For plain-text attachments (.txt/.md/.csv/.log/.json/.yaml/.xml):
//     decode the bytes directly — no external binary needed.
//   - When a binary is missing, capture metadata only and emit a one-line
//     stderr note so the operator knows what to install from the mirror.

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, getBinary, ConfluenceError } from './confluence-client.js';

// ---------- host capability detection (memoised) ----------------------------

let _pdftotext = null;
let _tesseract = null;

export function hasPdftotext() {
  if (_pdftotext !== null) return _pdftotext;
  _pdftotext = probeBinary('pdftotext', ['-v']);
  return _pdftotext;
}

export function hasTesseract() {
  if (_tesseract !== null) return _tesseract;
  _tesseract = probeBinary('tesseract', ['--version']);
  return _tesseract;
}

function probeBinary(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { stdio: 'pipe', windowsHide: true });
    // pdftotext prints to stderr; tesseract prints to stdout. Accept either.
    const text = (r.stdout?.toString() || '') + (r.stderr?.toString() || '');
    return r.status === 0 || r.status === 1 || /pdftotext|tesseract/i.test(text);
  } catch {
    return false;
  }
}

// ---------- API -------------------------------------------------------------

/**
 * Fetch attachment metadata for a given page id.
 * @param {string} pageId
 * @returns {Promise<Attachment[]>}
 */
export async function fetchAttachments(pageId) {
  // expand=metadata,extensions yields mediaType + fileSize on Cloud and DC.
  const data = await get(`/rest/api/content/${pageId}/child/attachment`, {
    query: { limit: '100', expand: 'metadata,extensions' },
  });
  const results = data?.results ?? [];
  const out = [];
  for (const a of results) {
    const downloadPath = a?._links?.download;
    if (!downloadPath) continue;
    const mediaType = a?.metadata?.mediaType
      || a?.extensions?.mediaType
      || guessMediaTypeFromName(a?.title)
      || 'application/octet-stream';
    out.push({
      id: String(a.id),
      title: a.title || '(untitled)',
      mediaType,
      fileSize: Number(a?.extensions?.fileSize) || 0,
      downloadPath,
      kind: classify(mediaType, a?.title),
      extractedText: null,
      extractionStatus: 'pending',
    });
  }
  return out;
}

/**
 * Download an attachment and (if host tooling permits) extract its text.
 * Mutates `att.extractedText` and `att.extractionStatus` in place.
 * Returns the same object for convenience.
 */
export async function extractAttachmentText(att, opts = {}) {
  const maxBytes = opts.maxBytes ?? 50 * 1024 * 1024; // 50MB hard cap
  if (att.fileSize > maxBytes) {
    att.extractionStatus = 'skipped:too-large';
    return att;
  }

  try {
    if (att.kind === 'pdf') {
      if (!hasPdftotext()) { att.extractionStatus = 'skipped:no-pdftotext'; return att; }
      const buf = await getBinary(att.downloadPath);
      att.extractedText = runPdftotext(buf);
      att.extractionStatus = att.extractedText ? 'ok' : 'failed:pdftotext';
      return att;
    }

    if (att.kind === 'image') {
      if (!hasTesseract()) { att.extractionStatus = 'skipped:no-tesseract'; return att; }
      const buf = await getBinary(att.downloadPath);
      att.extractedText = runTesseract(buf);
      att.extractionStatus = att.extractedText ? 'ok' : 'failed:tesseract';
      return att;
    }

    if (att.kind === 'text') {
      const buf = await getBinary(att.downloadPath);
      // Decode as UTF-8; cap per-attachment to keep the JSON payload sane.
      att.extractedText = buf.toString('utf8').slice(0, 50_000);
      att.extractionStatus = 'ok';
      return att;
    }

    // 'other' — capture metadata only.
    att.extractionStatus = 'skipped:unsupported-kind';
    return att;
  } catch (err) {
    att.extractionStatus = `failed:${err?.code || 'error'}`;
    return att;
  }
}

/**
 * Render an attachments appendix in markdown to inline into the page text.
 * The KnowledgeSummary derivation reads `page.text`, so this is how the
 * model sees attachment content.
 */
export function buildAttachmentsAppendix(items) {
  if (!items?.length) return '';
  const lines = ['\n\n---\n\n## Attachments\n'];
  for (const a of items) {
    const size = a.fileSize ? ` ${humanBytes(a.fileSize)}` : '';
    lines.push(`\n### ${a.title} _(${a.kind}, ${a.mediaType}${size})_\n`);
    if (a.extractedText) {
      lines.push(a.extractedText.slice(0, 20_000));
    } else {
      lines.push(`_(no extracted text — status: ${a.extractionStatus})_`);
    }
  }
  return lines.join('\n');
}

// ---------- internals -------------------------------------------------------

// Use a temp file rather than stdin/stdout pipes. Poppler's pdftotext
// supports `-` for stdin/stdout, but XPDF's pdftotext (also common on
// on-prem hosts) does not. Tempfile works with both implementations.
function runPdftotext(buf) {
  const dir = mkdtempSync(join(tmpdir(), 'penta-pdf-'));
  const inPath = join(dir, 'in.pdf');
  const outPath = join(dir, 'out.txt');
  try {
    writeFileSync(inPath, buf);
    // -layout preserves column structure; -enc UTF-8 forces unicode output.
    const r = spawnSync('pdftotext', ['-q', '-enc', 'UTF-8', '-layout', inPath, outPath], {
      maxBuffer: 200 * 1024 * 1024,
      windowsHide: true,
    });
    if (r.status !== 0) return null;
    return readFileSync(outPath, 'utf8').trim() || null;
  } catch { return null; }
  finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

function runTesseract(buf) {
  // Tesseract: also tempfile-friendly across versions. Output basename
  // implies <basename>.txt — pass without extension.
  const dir = mkdtempSync(join(tmpdir(), 'penta-img-'));
  const inPath = join(dir, 'in');
  const outBase = join(dir, 'out');
  try {
    writeFileSync(inPath, buf);
    const r = spawnSync('tesseract', [inPath, outBase, '-l', 'eng', '--psm', '6'], {
      maxBuffer: 200 * 1024 * 1024,
      windowsHide: true,
    });
    if (r.status !== 0) return null;
    return readFileSync(outBase + '.txt', 'utf8').trim() || null;
  } catch { return null; }
  finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

function classify(mediaType, title) {
  const m = (mediaType || '').toLowerCase();
  const ext = ((title || '').toLowerCase().split('.').pop() || '');
  if (m.includes('pdf') || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/') || ['png','jpg','jpeg','gif','webp','bmp','tiff','tif'].includes(ext)) return 'image';
  if (m.startsWith('text/') || ['md','txt','csv','log','json','yaml','yml','xml','tsv','ini','toml','conf'].includes(ext)) return 'text';
  return 'other';
}

function guessMediaTypeFromName(name) {
  if (!name) return null;
  const ext = name.toLowerCase().split('.').pop();
  const map = {
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    json: 'application/json', yaml: 'text/yaml', yml: 'text/yaml',
  };
  return map[ext] || null;
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @typedef {object} Attachment
 * @property {string} id
 * @property {string} title
 * @property {string} mediaType
 * @property {number} fileSize
 * @property {string} downloadPath          path relative to baseUrl
 * @property {'pdf'|'image'|'text'|'other'} kind
 * @property {string|null} extractedText
 * @property {string} extractionStatus      'ok' | 'pending' | 'skipped:*' | 'failed:*'
 */
