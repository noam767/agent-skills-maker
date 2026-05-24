#!/usr/bin/env node
/**
 * port-artifacts.mjs — convert Claude Code agent + skill artefacts into the
 * equivalent OpenCode, Continue, and Roo Code layouts.
 *
 * USAGE
 *   node scripts/port-artifacts.mjs --from <dir> [--to <dir>] [--targets opencode,continue,roo]
 *
 * INPUT TREE (either layout accepted)
 *   <from>/agents/<name>.md              (or)  <from>/.claude/agents/<name>.md
 *   <from>/skills/<name>/SKILL.md        (or)  <from>/.claude/skills/<name>/SKILL.md
 *
 * Skill subdirectories (e.g. scripts/, reference/) are copied alongside the
 * generated artefact for assistants that have a place to put them; for the
 * others the porter logs a note.
 *
 * OUTPUT TREE (relative to --to, default = --from)
 *   opencode/agent/<name>.md
 *   opencode/command/<skill>.md           ( + opencode/command/<skill>/ for support files)
 *   continue/agents/<name>.md
 *   continue/prompts/<skill>.prompt       ( + continue/prompts/<skill>/ for support files)
 *   roomodes                              (one YAML doc with all modes)
 *   roo/rules-<name>/01-instructions.md
 *   roo/rules-<skill>/01-procedure.md     ( + roo/rules-<skill>/scripts/ if present)
 *
 * The script is air-gapped (zero deps, Node stdlib only).
 */
import fs from 'node:fs';
import path from 'node:path';

// ---------- arg parsing -----------------------------------------------------
const args = parseArgs(process.argv.slice(2));
if (!args.from) {
  console.error('usage: node scripts/port-artifacts.mjs --from <dir> [--to <dir>] [--targets opencode,continue,roo]');
  process.exit(2);
}
const FROM = path.resolve(args.from);
const TO = path.resolve(args.to || args.from);
const TARGETS = (args.targets || 'opencode,continue,roo').split(',').map(s => s.trim()).filter(Boolean);

// ---------- input discovery -------------------------------------------------
const agentsDir = firstExisting([
  path.join(FROM, 'agents'),
  path.join(FROM, '.claude', 'agents'),
]);
const skillsDir = firstExisting([
  path.join(FROM, 'skills'),
  path.join(FROM, '.claude', 'skills'),
]);
if (!agentsDir && !skillsDir) {
  console.error(`no agents/ or skills/ found under ${FROM} (or its .claude/ subdir)`);
  process.exit(2);
}

const agents = agentsDir ? fs.readdirSync(agentsDir)
  .filter(f => f.endsWith('.md'))
  .map(f => loadAgent(path.join(agentsDir, f))) : [];

const skills = skillsDir ? fs.readdirSync(skillsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => loadSkill(path.join(skillsDir, d.name))) : [];

console.error(`[port] from=${FROM} to=${TO} agents=${agents.length} skills=${skills.length} targets=${TARGETS.join(',')}`);

// ---------- emit per target -------------------------------------------------
for (const t of TARGETS) {
  if (t === 'opencode')  emitOpencode(TO, agents, skills);
  else if (t === 'continue') emitContinue(TO, agents, skills);
  else if (t === 'roo')      emitRoo(TO, agents, skills);
  else console.error(`[port] WARN unknown target: ${t}`);
}
console.error('[port] done');

// ===========================================================================
// helpers
// ===========================================================================

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = (i + 1 < argv.length && !argv[i+1].startsWith('--')) ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  return out;
}

function firstExisting(paths) {
  for (const p of paths) if (fs.existsSync(p)) return p;
  return null;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

function loadAgent(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontmatter(text);
  const name = meta.name || path.basename(filePath, '.md');
  return {
    name,
    description: meta.description || '',
    tools: parseToolsList(meta.tools),
    // model: intentionally not pinned. Air-gapped envs may run any backend.
    color: meta.color || '',
    body: body.trim(),
    srcPath: filePath,
  };
}

function loadSkill(dirPath) {
  const skillFile = path.join(dirPath, 'SKILL.md');
  const text = fs.readFileSync(skillFile, 'utf8');
  const { meta, body } = parseFrontmatter(text);
  const name = meta.name || path.basename(dirPath);
  // Identify supporting files / subdirs alongside SKILL.md.
  const supporting = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(d => d.name !== 'SKILL.md')
    .map(d => ({ name: d.name, isDir: d.isDirectory() }));
  return {
    name,
    description: meta.description || '',
    body: body.trim(),
    supporting,
    srcDir: dirPath,
  };
}

function parseToolsList(raw) {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFileLogged(p, contents) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, contents);
  console.error(`[port]   wrote ${path.relative(TO, p)}`);
}

function copyTree(srcDir, dstDir) {
  ensureDir(dstDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ===========================================================================
// OpenCode
// ===========================================================================
function emitOpencode(toBase, agents, skills) {
  console.error('[port] emitting opencode/');
  const root = path.join(toBase, '.opencode');
  for (const a of agents) {
    const fm = [
      '---',
      `description: ${yamlScalar(a.description)}`,
      'mode: subagent',
      'tools:',
      ...toolsToOpencodeBlock(a.tools).map(l => '  ' + l),
      '---',
      '',
    ].join('\n');
    writeFileLogged(path.join(root, 'agent', `${a.name}.md`), fm + a.body + '\n');
  }
  for (const s of skills) {
    const fm = [
      '---',
      `description: ${yamlScalar(s.description)}`,
      'agent: build',
      '---',
      '',
    ].join('\n');
    writeFileLogged(path.join(root, 'command', `${s.name}.md`), fm + s.body + '\n');
    for (const sup of s.supporting) {
      const srcPath = path.join(s.srcDir, sup.name);
      const dstPath = path.join(root, 'command', s.name, sup.name);
      if (sup.isDir) copyTree(srcPath, dstPath); else { ensureDir(path.dirname(dstPath)); fs.copyFileSync(srcPath, dstPath); }
      console.error(`[port]   copied support ${path.relative(TO, dstPath)}`);
    }
  }
}

function toolsToOpencodeBlock(tools) {
  const all = ['read', 'write', 'edit', 'bash', 'grep', 'glob'];
  const set = new Set(tools.map(t => t.toLowerCase()));
  return all.map(t => `${t}: ${set.has(t)}`);
}

// ===========================================================================
// Continue
// ===========================================================================
function emitContinue(toBase, agents, skills) {
  console.error('[port] emitting continue/');
  const root = path.join(toBase, '.continue');
  for (const a of agents) {
    const fm = [
      '---',
      `name: ${a.name}`,
      `description: ${yamlScalar(a.description)}`,
      '---',
      '',
    ].join('\n');
    writeFileLogged(path.join(root, 'agents', `${a.name}.md`), fm + a.body + '\n');
  }
  for (const s of skills) {
    const fm = [
      '---',
      `name: ${s.name}`,
      `description: ${yamlScalar(s.description)}`,
      '---',
      '',
    ].join('\n');
    writeFileLogged(path.join(root, 'prompts', `${s.name}.prompt`), fm + s.body + '\n');
    for (const sup of s.supporting) {
      const srcPath = path.join(s.srcDir, sup.name);
      const dstPath = path.join(root, 'prompts', s.name, sup.name);
      if (sup.isDir) copyTree(srcPath, dstPath); else { ensureDir(path.dirname(dstPath)); fs.copyFileSync(srcPath, dstPath); }
      console.error(`[port]   copied support ${path.relative(TO, dstPath)}`);
    }
  }
}

// ===========================================================================
// Roo Code
// ===========================================================================
function emitRoo(toBase, agents, skills) {
  console.error('[port] emitting roo/ and roomodes');
  const root = path.join(toBase);
  const modes = [];

  for (const a of agents) {
    const slug = a.name;
    const role = firstParagraph(a.body) || a.description || `Agent: ${a.name}`;
    const groups = toolsToRooGroups(a.tools);
    modes.push({
      slug,
      name: humanize(a.name),
      roleDefinition: role,
      groups,
      customInstructions: `See .roo/rules-${slug}/ for the full procedure. ${a.description}`.trim(),
    });
    writeFileLogged(
      path.join(root, '.roo', `rules-${slug}`, '01-instructions.md'),
      `# ${humanize(a.name)}\n\n${a.body}\n`
    );
  }

  for (const s of skills) {
    const slug = s.name;
    const role = s.description || `Skill: ${s.name}`;
    modes.push({
      slug,
      name: humanize(s.name),
      roleDefinition: role,
      groups: ['read', 'edit'],
      customInstructions: `See .roo/rules-${slug}/ for the procedure.`,
    });
    writeFileLogged(
      path.join(root, '.roo', `rules-${slug}`, '01-procedure.md'),
      `# ${humanize(s.name)}\n\n${s.body}\n`
    );
    for (const sup of s.supporting) {
      const srcPath = path.join(s.srcDir, sup.name);
      const dstPath = path.join(root, '.roo', `rules-${slug}`, sup.name);
      if (sup.isDir) copyTree(srcPath, dstPath); else { ensureDir(path.dirname(dstPath)); fs.copyFileSync(srcPath, dstPath); }
      console.error(`[port]   copied support ${path.relative(TO, dstPath)}`);
    }
  }

  writeFileLogged(path.join(root, '.roomodes'), renderRoomodes(modes));
}

function toolsToRooGroups(tools) {
  const set = new Set(tools.map(t => t.toLowerCase()));
  const g = [];
  if (['read', 'grep', 'glob'].some(t => set.has(t))) g.push('read');
  if (['write', 'edit'].some(t => set.has(t))) g.push('edit');
  if (set.has('bash')) g.push('command');
  if (!g.length) g.push('read');
  return g;
}

function renderRoomodes(modes) {
  const lines = ['customModes:'];
  for (const m of modes) {
    lines.push(`  - slug: ${m.slug}`);
    lines.push(`    name: ${yamlScalar(m.name)}`);
    lines.push(`    roleDefinition: >-`);
    for (const wrapped of softWrap(m.roleDefinition, 76)) lines.push(`      ${wrapped}`);
    lines.push(`    groups:`);
    for (const g of m.groups) lines.push(`      - ${g}`);
    lines.push(`    customInstructions: >-`);
    for (const wrapped of softWrap(m.customInstructions, 76)) lines.push(`      ${wrapped}`);
  }
  return lines.join('\n') + '\n';
}

// ===========================================================================
// shared text helpers
// ===========================================================================
function yamlScalar(s) {
  if (!s) return '""';
  // Quote if it contains characters that confuse a simple YAML reader.
  if (/[:#&*!|>%@`,\[\]\{\}'"]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s); // JSON strings are valid YAML scalars.
  }
  return s;
}

function softWrap(text, width) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [''];
  const words = t.split(' ');
  const out = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > width) { out.push(cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

function firstParagraph(body) {
  const sections = body.split(/\n\s*\n/);
  for (const s of sections) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue; // skip headings
    return trimmed.replace(/\s+/g, ' ');
  }
  return '';
}

function humanize(slug) {
  return slug.split(/[-_]/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}
