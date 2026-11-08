// Percy's workshop: one folder per project under data/workspace, real files, real version history (git),
// and a sandbox for running his JavaScript: it can only see its own project folder, cannot start programs,
// and has no network.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

export const ROOT = path.resolve(config.dataDir, 'workspace');
const here = path.dirname(fileURLToPath(import.meta.url));
const BLOCK = path.join(here, 'sandbox-block.mjs');
const TEXT = /\.(html?|css|m?js|json|svg|txt|md|csv|xml)$/i;
const LIMITS = { file: 200 * 1024, project: 3 * 1024 * 1024, files: 80 };
fs.mkdirSync(ROOT, { recursive: true });

let gitOK = null;
export async function hasGit() { if (gitOK !== null) return gitOK; gitOK = await new Promise(r => execFile('git', ['--version'], e => r(!e))); return gitOK; }
export const slugify = s => String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
export const dir = slug => path.join(ROOT, slugify(slug));
function safe(slug, rel) {
  const base = dir(slug), p = path.resolve(base, String(rel || '').replace(/^\/+/, ''));
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('that path is outside the project');
  if (p.split(path.sep).includes('.git')) throw new Error('the version history is not editable directly; use commit');
  return p;
}
export async function create(slug) {
  const d = dir(slug); fs.mkdirSync(d, { recursive: true });
  if (await hasGit() && !fs.existsSync(path.join(d, '.git'))) await git(slug, ['init', '-q']);
  return d;
}
export function list(slug) {
  const base = dir(slug), out = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === '.git') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push({ path: path.relative(base, p), size: fs.statSync(p).size }); } };
  if (fs.existsSync(base)) walk(base); return out;
}
export function read(slug, rel, from = 1, to = 0) {
  const p = safe(slug, rel); if (!fs.existsSync(p)) throw new Error('no such file: ' + rel);
  const lines = fs.readFileSync(p, 'utf8').split('\n'); const a = Math.max(1, from), b = to > 0 ? Math.min(lines.length, to) : Math.min(lines.length, a + 399);
  return { path: rel, lines: lines.length, from: a, to: b, text: lines.slice(a - 1, b).map((l, i) => (a + i) + '| ' + l).join('\n') };
}
export function write(slug, rel, content) {
  const p = safe(slug, rel); content = String(content ?? '');
  if (!TEXT.test(p)) throw new Error('only text files (html, css, js, json, svg, txt, md, csv, xml)');
  if (Buffer.byteLength(content) > LIMITS.file) throw new Error('file too large (limit 200 KB)');
  const files = list(slug); const exists = fs.existsSync(p);
  if (!exists && files.length >= LIMITS.files) throw new Error('too many files in this project');
  const total = files.reduce((s, f) => s + f.size, 0) - (exists ? fs.statSync(p).size : 0) + Buffer.byteLength(content);
  if (total > LIMITS.project) throw new Error('project too large (limit 3 MB)');
  fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content);
  return { path: rel, bytes: Buffer.byteLength(content), lines: content.split('\n').length, created: !exists };
}
export function edit(slug, rel, oldStr, newStr) {
  const p = safe(slug, rel); if (!fs.existsSync(p)) throw new Error('no such file: ' + rel);
  const s = fs.readFileSync(p, 'utf8'), n = s.split(String(oldStr)).length - 1;
  if (!oldStr) throw new Error('old text is empty');
  if (n === 0) throw new Error('the old text was not found in ' + rel);
  if (n > 1) throw new Error('the old text appears ' + n + ' times; include more of the surrounding text');
  return write(slug, rel, s.replace(String(oldStr), () => String(newStr ?? '')));
}
export function remove(slug, rel) { const p = safe(slug, rel); if (!fs.existsSync(p)) throw new Error('no such file'); fs.rmSync(p); return { removed: rel }; }
export function readAll(slug) { return list(slug).filter(f => TEXT.test(f.path)).map(f => ({ path: f.path, content: fs.readFileSync(path.join(dir(slug), f.path), 'utf8') })); }

function git(slug, args) {
  return new Promise((res, rej) => execFile('git', ['-C', dir(slug), '-c', 'user.name=Percy', '-c', 'user.email=percy@mossbrook.invalid', '-c', 'commit.gpgsign=false', ...args], { timeout: 15000 }, (e, out, err) => e ? rej(new Error(String(err || e.message).trim().slice(0, 300))) : res(String(out).trim())));
}
export async function commit(slug, message) {
  if (!(await hasGit())) return { error: 'version history is not available here' };
  await git(slug, ['add', '-A']);
  const st = await git(slug, ['status', '--porcelain']); if (!st) return { committed: false, note: 'nothing changed since the last version' };
  await git(slug, ['commit', '-q', '-m', String(message || 'work in progress').slice(0, 200)]);
  return { committed: true, version: await git(slug, ['rev-parse', '--short', 'HEAD']) };
}
export async function history(slug, n = 6) { if (!(await hasGit())) return []; try { return (await git(slug, ['log', '--oneline', '-n', String(n)])).split('\n').filter(Boolean); } catch { return []; } }
export async function restore(slug, version, rel) { if (!(await hasGit())) throw new Error('no version history'); await git(slug, ['checkout', String(version).slice(0, 40), '--', rel ? String(rel) : '.']); return { restored: rel || 'all files', from: version }; }

// Run one of his scripts in the sandbox. Real output, real exit code, real time.
export function run(slug, rel, args = []) {
  const p = safe(slug, rel); if (!fs.existsSync(p)) return Promise.resolve({ error: 'no such file: ' + rel });
  if (!/\.m?js$/i.test(p)) return Promise.resolve({ error: 'only .js or .mjs files can be run' });
  const d = dir(slug), started = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--permission', '--allow-fs-read=' + d, '--allow-fs-read=' + BLOCK, '--allow-fs-write=' + d, '--max-old-space-size=128', '--disable-warning=ExperimentalWarning', '--import', BLOCK, p, ...args.map(String).slice(0, 10)],
      { cwd: d, env: { PATH: process.env.PATH, NODE_ENV: 'sandbox' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', killed = false;
    const cap = (s, d2) => (s.length < 8000 ? s + d2 : s);
    child.stdout.on('data', x => { out = cap(out, String(x)); }); child.stderr.on('data', x => { err = cap(err, String(x)); });
    const t = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, config.runTimeoutMs);
    child.on('close', code => { clearTimeout(t); resolve({ exitCode: code, timedOut: killed, ms: Date.now() - started, stdout: out.slice(0, 6000), stderr: err.replace(new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '.').slice(0, 4000) }); });
  });
}
