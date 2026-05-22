// Strips Confluence storage-format XHTML to plain text suitable for LLM ingestion.
// Headings become `#`/`##`/`###` lines; lists become `- ` lines; tables become
// tab-separated rows. Entity references are decoded. Output is truncated at
// 20 000 characters with a trailing marker.

const MAX_LEN = 20_000;
const TRUNCATE_SUFFIX = '\n…[TRUNCATED]';

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ndash: '-', mdash: '—', hellip: '…',
  copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, name) => {
    if (name[0] === '#') {
      const codeStr = name.slice(1);
      const code = codeStr[0] === 'x' || codeStr[0] === 'X'
        ? parseInt(codeStr.slice(1), 16)
        : parseInt(codeStr, 10);
      if (Number.isFinite(code)) {
        try { return String.fromCodePoint(code); } catch { return full; }
      }
      return full;
    }
    return NAMED_ENTITIES[name] ?? full;
  });
}

function stripScriptsAndStyles(s) {
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
}

function rewriteHeadings(s) {
  return s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, level, inner) => {
    const text = stripTags(inner).trim();
    if (!text) return '';
    return `\n${'#'.repeat(Number(level))} ${text}\n`;
  });
}

function rewriteListItems(s) {
  return s.replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_m, inner) => {
    const text = stripTags(inner).trim();
    return text ? `\n- ${text}` : '';
  });
}

function rewriteTables(s) {
  return s.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi, (_m, inner) => {
    const cells = [];
    inner.replace(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]\s*>/gi, (_x, cell) => {
      cells.push(stripTags(cell).trim().replace(/\s+/g, ' '));
      return '';
    });
    return cells.length ? `\n${cells.join('\t')}` : '';
  });
}

function rewriteParagraphsAndBreaks(s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n');
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '');
}

function collapseWhitespace(s) {
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalise a Confluence storage-format XHTML string to plain text.
 * @param {string} xhtml
 * @returns {string}
 */
export function normalize(xhtml) {
  if (!xhtml) return '';
  let s = xhtml;
  s = stripScriptsAndStyles(s);
  s = rewriteHeadings(s);
  s = rewriteTables(s);
  s = rewriteListItems(s);
  s = rewriteParagraphsAndBreaks(s);
  s = stripTags(s);
  s = decodeEntities(s);
  s = collapseWhitespace(s);
  if (s.length > MAX_LEN) {
    s = s.slice(0, MAX_LEN) + TRUNCATE_SUFFIX;
  }
  return s;
}
