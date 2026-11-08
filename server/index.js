// Percy's server: runs his world nonstop, serves the town page and its side pages, and the keeper's tools.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { loadJSON, saveJSON, dailyBackup } from './store.js';
import { canCall, setBudgetSource, status as claudeStatus, budget } from './claude.js';
import * as W from './world.js';
import * as Agent from './agent.js';
import * as Mem from './memory.js';
import * as C from './create.js';
import * as Sessions from './sessions.js';
import * as Code from './code.js';
import * as WS from './workshop.js';
import * as B from './browser.js';
import * as Search from './search.js';
import * as Pub from './publish.js';
import { str, uid } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const SAVE = path.join(config.dataDir, 'world.json');
const MEDIA = path.join(config.dataDir, 'media');
for (const d of ['drawings', 'graffiti', 'uploads']) fs.mkdirSync(path.join(MEDIA, d), { recursive: true });
function writeMedia(rel, data) { try { fs.writeFileSync(path.join(MEDIA, rel), data); } catch (e) { console.warn('[percy] could not save ' + rel + ':', e.message); } }
function parseDataURL(u) {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || '')); if (!m) return null;
  const buf = Buffer.from(m[3], 'base64'); if (buf.length > 4 * 1024 * 1024) return null;
  return { mediaType: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2], buf, data: m[3] };
}

/* ---------- load the world (P0: anything older is archived, never deleted) ---------- */
let S = loadJSON(SAVE);
if (!S && fs.existsSync(SAVE)) {
  const bdir = path.join(config.dataDir, 'backups');
  const tries = [SAVE + '.tmp', ...(fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => f.startsWith('world-')).sort().reverse().map(f => path.join(bdir, f)) : [])];
  for (const f of tries) { S = loadJSON(f); if (S) { console.warn('[percy] world.json could not be read; restored from ' + f); break; } }
  try { fs.copyFileSync(SAVE, path.join(config.dataDir, 'world-unreadable-' + Date.now() + '.json')); } catch {}
}
if (S && (S.v || 1) < W.SCHEMA) {
  // an earlier design: kept whole in an archive folder, and a new instance begins (the keeper asked for a fresh start)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), adir = path.join(config.dataDir, 'archive-v' + (S.v || 1) + '-' + stamp);
  fs.mkdirSync(adir, { recursive: true });
  saveJSON(path.join(adir, 'world.json'), S);
  try { if (fs.existsSync(MEDIA)) fs.cpSync(MEDIA, path.join(adir, 'media'), { recursive: true }); } catch (e) { console.warn('[percy] could not archive media:', e.message); }
  for (const d of ['drawings', 'graffiti']) { try { for (const f of fs.readdirSync(path.join(MEDIA, d))) fs.rmSync(path.join(MEDIA, d, f)); } catch {} }
  console.log('[percy] the previous world (schema v' + (S.v || 1) + ') is archived in ' + adir + '; a new Percy begins');
  S = null;
}
if (!S) { S = W.newWorld(); W.setState(S); console.log('[percy] a new world begins'); }
else { W.migrate(S); W.setState(S); S.deciding = false; console.log('[percy] world loaded: day ' + W.dayOf(S.t) + ', ' + W.hhmm(S.t)); }
function save() { S.lastSeenReal = Date.now(); try { saveJSON(SAVE, S); dailyBackup(config.dataDir, S); } catch (e) { console.error('[percy] save failed:', e.message); } }

/* ---------- the keeper's live settings ---------- */
setBudgetSource(() => S.settings);
const searchVia = () => Search.via(S.settings.searchVia || 'auto');
function permissions() {
  const via = searchVia();
  return { web_search: config.webResearch && (via !== 'claude' || !!config.apiKey), run_code: true, browser: B.available(), publish_site: Pub.enabled() && (config.autoPublish || !!S.settings.publishApproved), requests: true };
}

/* ---------- his website ---------- */
function shopData() {
  const items = S.shop.filter(x => !x.withdrawn && (!x.sold || W.dayOf(S.t) - (x.soldDay || 0) < 30)).slice(-60).map(x => {
    const pr = x.kind === 'project' ? S.projects.find(p => p.id === x.ref) : null, pg = x.kind === 'page' ? S.pages.find(p => p.id === x.ref) : null;
    return { code: x.code, title: x.title, blurb: x.blurb || '', price: x.price, pounds: W.pounds(x.price), kind: x.kind, img: x.kind === 'drawing' ? '../../drawings/' + x.ref + '.svg' : '', link: pr && pr.url ? pr.url : pg && pg.published ? '../../pages/' + Pub.slug(pg.title) + '.html' : '', sold: !!x.sold };
  });
  return { items, kofi: config.kofiUrl, townUrl: config.publicUrl, coinsPerPound: config.coinsPerPound, updated: 'day ' + W.dayOf(S.t) };
}
function siteIndex() { if (Pub.enabled()) Pub.queueFile('index.html', Pub.indexHTML(S), 'update index'); }
function publishProject(pr) {
  if (!permissions().publish_site) return { error: 'publishing is not permitted' };
  const r = Pub.publishFiles(pr.slug, WS.readAll(pr.slug), shopData(), 'percy published ' + pr.title);
  pr.url = r.url; pr.publishedDay = W.dayOf(S.t); siteIndex(); W.wlog('published project ' + pr.title); return { url: r.url, files: r.files, note: 'queued for upload; usually live within a couple of minutes' };
}
function publishPage(page) {
  if (!permissions().publish_site) return '';
  Pub.queueFile('pages/' + Pub.slug(page.title) + '.html', Pub.pageHTML(page), 'percy wrote ' + page.title); page.published = true; siteIndex();
  return 'published it on his website';
}
// when his listings change: drawings in the shop need their pictures online, and pages with a shop slot need fresh stock
function shopChanged() {
  if (!Pub.enabled()) return;
  for (const l of W.openListings()) if (l.kind === 'drawing') { const d = S.drawings.find(x => x.id === l.ref); if (d && !d.published) { try { Pub.queueFile('drawings/' + d.id + '.svg', fs.readFileSync(path.join(MEDIA, 'drawings', d.id + '.svg'), 'utf8'), 'drawing for the shop'); d.published = true; } catch {} } }
  for (const pr of S.projects) if (pr.url) { const files = WS.readAll(pr.slug).filter(f => /\.html?$/i.test(f.path) && Pub.SHOP_SLOT.test(f.content)); if (files.length) Pub.publishFiles(pr.slug, files, shopData(), 'shop stock'); }
  siteIndex();
}
function saveDrawing({ subject, svg, atStall, order }) {
  const d = { id: 'd' + uid(), day: W.dayOf(S.t), time: W.hhmm(S.t), title: str(subject, 60), subject: str(subject, 300), offerAtStall: !!atStall, forOrder: order || '', sold: false };
  writeMedia('drawings/' + d.id + '.svg', svg); S.drawings.push(d); if (S.drawings.length > 400) S.drawings.shift();
  return { facts: ['finished a drawing: "' + d.title + '" (' + d.id + ')' + (atStall ? '; it is to go out on the stall next time he is there' : '')], refs: { drawing: [d.id] }, lifeExtra: { drawing: d.id } };
}
function saveWall(g, svg) { if (typeof svg !== 'string') return; writeMedia('graffiti/' + g.id + '.svg', svg); g.img = '/media/graffiti/' + g.id + '.svg'; g.h = g.w * 840 / 800; W.bump(); }

/* ---------- connect the parts ---------- */
const streams = new Set();
Agent.init(S, {
  save, permissions, watchers: () => streams.size, saveDrawing, saveWall, shopChanged,
  research: o => Sessions.research({ ...o, how: searchVia() }),
  code: o => Code.code({ ...o, how: searchVia(), permissions: permissions(), publishProject }),
  writePage: o => Sessions.writePage({ ...o, publishPage }),
  readText: o => Sessions.readText(o),
});
W.setHooks({ onComplete: Agent.onComplete, onArrive: Agent.onArrive });
B.setOwnPort(config.port);

let lastDecision = 0;
function requestDecision() {
  if (S.deciding) return;
  if (Date.now() - lastDecision < 1500) return; // never more than one decision every 1.5 seconds
  lastDecision = Date.now(); S.deciding = true;
  Promise.resolve().then(() => Agent.decide()).catch(e => { console.warn('[percy] decision error:', e.message); if (!S.act) Agent.continuity({ id: 'j' + uid(), t: S.t, day: W.dayOf(S.t), time: W.hhmm(S.t), trigger: 'error' }, 'error: ' + e.message); })
    .finally(() => { S.deciding = false; W.bump(); });
}

/* ---------- the clock ---------- */
let last = Date.now(), lastSave = Date.now(), lastGlance = 0;
setInterval(() => {
  const now = Date.now(); const dt = Math.min(5, (now - last) / 1000); last = now;
  try { W.tick(dt, requestDecision); } catch (e) { console.error('[percy] tick error:', e); }
  if (S.act && S.act.phase === 'walk' && now - lastGlance > 2000) { lastGlance = now; try { Agent.glance(); } catch {} }
  if (now - lastSave > 30000) { lastSave = now; save(); }
}, 250);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); B.stop(); process.exit(0); });

/* ---------- what the pages show ---------- */
function publicState() {
  const m = S.mind, day = W.dayOf(S.t);
  return {
    t: S.t, day, time: W.hhmm(S.t), hour: W.hourOf(S.t), weather: S.weather.kind, season: W.seasonOf(day), scale: config.timeScale, rev: S.rev,
    pos: S.pos, face: S.face, inside: S.inside, act: S.act ? { type: S.act.type, id: actId(S.act), phase: S.act.phase, caption: S.act.caption, place: S.act.place, inside: S.act.phase === 'do' && S.inside ? S.inside : null } : null,
    doing: doingText(), thought: S.thought, feeling: S.feeling, body: S.body, coins: S.coins, pantry: S.pantry,
    town: W.publicTown(), things: S.things.map(t => ({ id: t.id, name: t.name, x: t.x, z: t.z, size: t.size, model: t.model, status: t.status, day: t.day, known: !!m.knownThings[t.id], hisName: (m.knownThings[t.id] || {}).name || '' })),
    graffiti: S.graffiti, items: S.items.filter(i => !i.sold).map(i => ({ id: i.id, shop: i.shop, name: i.name, price: i.price, model: i.model, img: i.img || '', status: i.status })), inventory: S.inventory,
    drawings: S.drawings.slice(-120).map(d => ({ id: d.id, day: d.day, title: d.title, onStall: !!d.onStall, sold: !!d.sold, price: d.price || 0, listed: !!d.listed, forOrder: d.forOrder })),
    pages: S.pages.slice(-80).map(p => p.kind === 'notes' ? { id: p.id, day: p.day, title: p.title, kind: 'notes', private: true } : p),
    projects: S.projects.map(p => ({ id: p.id, slug: p.slug, title: p.title, goal: p.goal, status: p.status, day: p.day, sittings: p.sittings, files: p.files, url: p.url, lastTest: p.lastTest, next: p.next, notes: p.notes.slice(-30), history: p.history.slice(-30) })),
    mind: { intentions: m.intentions.filter(i => i.status === 'active' || i.status === 'paused').concat(m.intentions.filter(i => ['done', 'abandoned'].includes(i.status)).slice(-12)), questions: m.questions.slice(-40), semantic: m.semantic.filter(s => !s.superseded).slice(-120), personal: m.personal.slice(-60), procedural: m.procedural.slice(-40), summaries: m.summaries.slice(-10), counts: Mem.counts(), named: Object.entries(m.knownThings).filter(([, k]) => k.name).map(([id, k]) => ({ id, name: k.name })), placesKnown: Object.keys(m.knownPlaces).length, roadsWalked: m.roadsWalked },
    life: S.life.slice(-200), requests: S.requests.slice(-60), ideas: S.ideas.slice(-30), researchLog: S.researchLog.slice(-120),
    notes: S.notes.map(n => ({ id: n.id, text: n.text, from: n.from, day: n.day, read: !!n.read })), percyNotes: S.percyNotes.slice(-30),
    shop: S.shop.filter(x => !x.withdrawn).slice(-60).map(x => ({ ...x, pounds: W.pounds(x.price) })), commissions: S.commissions.slice(0, 40), coinsPerPound: config.coinsPerPound,
    post: S.post.slice(-20).map(e => ({ coins: e.coins, from: e.public ? e.from : '', message: e.public ? e.message : '', day: e.day, collected: e.collected, forTitle: e.forTitle || '' })), earned: S.earned,
    mindStatus: claudeStatus(), watchers: streams.size, keeper: !!config.keeperKey, siteUrl: Pub.enabled() ? Pub.siteUrl() : '', publicUrl: config.publicUrl, kofiUrl: config.kofiUrl, kofiOn: !!config.kofiToken, printShopUrl: config.printShopUrl,
  };
}
function doingText() {
  const a = S.act;
  if (!a) return S.deciding ? 'thinking about what to do' : 'pausing';
  const p = a.place ? W.placeById(a.place) : null;
  if (a.phase === 'walk') return a.caption && /^walking|^going/.test(a.caption) ? a.caption : 'walking' + (p ? ' to ' + (S.mind.knownPlaces[p.id] ? p.name : 'somewhere') : '') + (a.caption ? ' (' + a.caption + ')' : '');
  return a.caption || a.type;
}
const actId = a => a.type === 'paint_wall' ? 'graffiti' : a.type;
function live() {
  return { t: S.t, day: W.dayOf(S.t), time: W.hhmm(S.t), pos: S.pos, face: S.face, inside: S.inside, act: S.act ? { type: S.act.type, id: actId(S.act), phase: S.act.phase, inside: S.act.phase === 'do' && S.inside ? S.inside : null } : null,
    doing: doingText(), thought: S.thought, feeling: S.feeling, body: S.body, coins: S.coins, weather: S.weather.kind, season: W.seasonOf(W.dayOf(S.t)), rev: S.rev, watchers: streams.size, deciding: S.deciding, scale: config.timeScale };
}
setInterval(() => { const msg = 'data: ' + JSON.stringify(live()) + '\n\n'; for (const r of streams) r.write(msg); }, 1000);

/* ---------- web server ---------- */
const TYPES = { '.jpg': 'image/jpeg', '.webp': 'image/webp', '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.xml': 'text/xml' };
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const isLoopback = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];
const lastNoteBy = new Map(), lastBuyBy = new Map(), jobsBy = new Map();
function readRaw(req, limit = 65536) { return new Promise((resolve, reject) => { let data = ''; req.on('data', c => { data += c; if (data.length > limit) { reject(new Error('too large')); req.destroy(); } }); req.on('end', () => resolve(data)); req.on('error', reject); }); }
function readBody(req, limit = 10000) { return readRaw(req, limit).then(d => { try { return d ? JSON.parse(d) : {}; } catch { throw new Error('bad json'); } }); }
const eq = (a, b) => { if (!b || typeof a !== 'string') return false; const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest(); return crypto.timingSafeEqual(x, y); };
function send(res, code, body, type = 'application/json') { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); }
function payIn(opts) { const r = W.receivePayment(opts); if (!r.duplicate) { save(); if (r.listing) shopChanged(); } return r; }
// his project files, served with a sandbox policy so their scripts can never touch this site's storage or the keeper's key
function serveProjectFile(res, req, slugPart, rest) {
  const base = WS.dir(slugPart), file = path.normalize(path.join(base, decodeURIComponent(rest || 'index.html')));
  if (!file.startsWith(base) || file.includes(path.sep + '.git')) return send(res, 403, 'no', 'text/plain');
  fs.stat(file, (err, st) => {
    const f = !err && st.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(f, 'utf8', (e2, data) => {
      if (e2) return send(res, 404, 'not found', 'text/plain');
      if (/\.html?$/i.test(f)) data = Pub.fillShop(data, shopData());
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': 'sandbox allow-scripts allow-forms allow-popups allow-modals', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/state') return send(res, 200, publicState());
    if (req.method === 'GET' && p === '/api/live') return send(res, 200, live());
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, day: W.dayOf(S.t), time: W.hhmm(S.t), ...claudeStatus(), freeSearch: { via: searchVia(), health: Search.searchHealth(), ...Search.local }, browser: B.available(), git: await WS.hasGit(), website: Pub.pubStatus, kofi: { on: !!config.kofiToken } });
    if (req.method === 'GET' && p === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n'); streams.add(res); req.on('close', () => streams.delete(res)); return;
    }
    if (req.method === 'POST' && p === '/api/notes') {
      const b = await readBody(req); const text = str(b.text, 1000), from = str(b.from, 30);
      if (!text) return send(res, 400, { error: 'Write something first.' });
      const ip = ipOf(req); if (Date.now() - (lastNoteBy.get(ip) || 0) < 90000) return send(res, 429, { error: 'One note at a time. Try again in a minute or two.' });
      if (S.notes.filter(n => !n.read).length >= 15) return send(res, 429, { error: 'The stone is full of unread notes. Try again later.' });
      lastNoteBy.set(ip, Date.now()); S.notes.unshift({ id: uid(), text, from, day: W.dayOf(S.t), read: false }); if (S.notes.length > 100) S.notes.pop();
      W.wlog('a visitor left a note under the stone'); W.bump(); save(); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/buy') {
      const b = await readBody(req); const ip = ipOf(req);
      if (Date.now() - (lastBuyBy.get(ip) || 0) < 10 * 60000) return send(res, 429, { error: 'One drawing at a time. Come back in a few minutes.' });
      const r = W.buyDrawing(String(b.id || '')); if (r.error) return send(res, 400, { error: r.error });
      lastBuyBy.set(ip, Date.now()); save(); return send(res, 200, { ok: true, img: '/media/drawings/' + b.id + '.svg' });
    }
    if (req.method === 'POST' && p === '/api/commissions') {
      const b = await readBody(req); const ip = ipOf(req), now = Date.now(); const mine = (jobsBy.get(ip) || []).filter(t => now - t < 86400000);
      if (mine.length && now - mine[mine.length - 1] < 600000) return send(res, 429, { error: 'One letter at a time. Try again in a few minutes.' });
      if (mine.length >= 3) return send(res, 429, { error: 'That\'s three letters today. Give him a chance to catch up.' });
      const r = W.postCommission(b); if (r.error) return send(res, 400, { error: r.error });
      jobsBy.set(ip, mine.concat([now])); save(); return send(res, 200, { ok: true, id: r.commission.id, code: r.commission.code });
    }
    if (req.method === 'POST' && p === '/api/kofi') {
      if (!config.kofiToken) return send(res, 404, { error: 'not found' });
      const raw = await readRaw(req); let d = null;
      try { d = JSON.parse(new URLSearchParams(raw).get('data') || raw); } catch { try { d = JSON.parse(raw); } catch {} }
      if (!d || !eq(d.verification_token, config.kofiToken)) return send(res, 403, { error: 'bad token' });
      const amount = Number.parseFloat(d.amount) || 0;
      if (amount > 0) { const r = payIn({ coins: Math.round(amount * config.coinsPerPound), from: d.from_name, message: d.message, amount: amount.toFixed(2) + ' ' + (d.currency || ''), ref: d.message_id || d.kofi_transaction_id, isPublic: d.is_public !== false, source: 'kofi' }); console.log('[percy] ko-fi: ' + amount.toFixed(2) + ' ' + (d.currency || '') + (r.duplicate ? ' (already counted)' : ' became coins')); }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p.startsWith('/api/keeper/')) return keeper(req, res, p.slice(12));
    if ((req.method === 'GET' || req.method === 'HEAD') && p.startsWith('/media/')) {
      const file = path.normalize(path.join(MEDIA, decodeURIComponent(p.slice(7)))); if (!file.startsWith(MEDIA)) return send(res, 403, 'no', 'text/plain');
      return fs.readFile(file, (err, data) => { if (err) return send(res, 404, 'not found', 'text/plain'); res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=86400', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:", 'x-content-type-options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : data); });
    }
    let m;
    if ((req.method === 'GET' || req.method === 'HEAD') && (m = p.match(/^\/__preview\/([a-z0-9-]+)\/?(.*)$/))) { if (!isLoopback(req)) return send(res, 403, 'preview is only for his own browser', 'text/plain'); return serveProjectFile(res, req, m[1], m[2]); }
    if ((req.method === 'GET' || req.method === 'HEAD') && (m = p.match(/^\/projects\/([a-z0-9-]+)\/?(.*)$/))) { if (!S.projects.some(x => x.slug === m[1])) return send(res, 404, 'not found', 'text/plain'); return serveProjectFile(res, req, m[1], m[2]); }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const route = { '/': 'index.html', '/shop': 'shop.html', '/requests': 'requests.html', '/research': 'research.html' }[p.replace(/(.)\/$/, '$1')];
      const file = path.normalize(path.join(PUBLIC, route || p)); if (!file.startsWith(PUBLIC)) return send(res, 403, 'no', 'text/plain');
      return fs.readFile(file, (err, data) => { if (err) return send(res, 404, 'not found', 'text/plain'); res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data); });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: e.message === 'too large' ? 'That was too long.' : 'Something about that request was off.' }); }
});

/* ---------- the keeper's tools: environment, budget, requests; never his choices ---------- */
async function keeper(req, res, what) {
  const b = await readBody(req, 7 * 1024 * 1024);
  if (!config.keeperKey) return send(res, 403, { error: 'Keeper tools are off. Set KEEPER_KEY in the container settings to use them.' });
  if (!eq(b.key, config.keeperKey)) return send(res, 403, { error: 'That keeper key is wrong.' });
  const ok = (extra = {}) => { save(); W.bump(); return send(res, 200, { ok: true, ...extra }); };
  switch (what) {
    case 'check': return send(res, 200, { ok: true });
    case 'private': // the keeper's view: budget, journal, world log, permissions
      return send(res, 200, { budget: budget(), usage: claudeStatus(), settings: S.settings, permissions: permissions(), publishing: Pub.enabled(), searchHealth: Search.searchHealth(), rooms: S.town.places.filter(p => p.inside && p.inside.items && p.inside.items.length).map(p => ({ id: p.id, name: p.name, items: p.inside.items.map(i => ({ id: i.id, name: i.name, text: (i.text || '').slice(0, 160), taken: !!i.taken, book: !!i.book })) })), searchVia: searchVia(), searxng: !!config.searxngUrl, browser: B.available(), freeSearch: Search.local,
        journal: S.journal.slice(-120), worldLog: S.worldLog, agent: Agent.state(), defaults: { callsPerDay: config.maxCallsPerDay, searchesPerDay: config.maxSearchesPerDay, spendPerDay: config.maxSpendPerDay } });
    case 'settings': {
      const s = S.settings, n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : undefined; };
      if ('callsPerDay' in b) s.callsPerDay = n(b.callsPerDay, 0, 5000);
      if ('searchesPerDay' in b) s.searchesPerDay = n(b.searchesPerDay, 0, 500);
      if ('spendPerDay' in b) s.spendPerDay = n(b.spendPerDay, 0, 200);
      if ('paused' in b) s.paused = !!b.paused;
      if ('quality' in b) s.quality = b.quality === 'better' ? 'better' : 'economy';
      if ('searchVia' in b) s.searchVia = ['auto', 'searxng', 'browser', 'claude'].includes(b.searchVia) ? b.searchVia : 'auto';
      if ('publishApproved' in b) s.publishApproved = !!b.publishApproved;
      for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
      W.wlog('keeper changed settings: ' + JSON.stringify(s)); return ok({ settings: s, budget: budget() });
    }
    case 'respond': { // answer one of Percy's requests: a letter goes to the post office; approvals change nothing by themselves
      const q = S.requests.find(x => x.id === b.id); if (!q) return send(res, 400, { error: 'No such request.' });
      const st = ['approved', 'declined', 'modified', 'fulfilled', 'open'].includes(b.status) ? b.status : 'open';
      q.status = st; q.response = str(b.note, 600); q.updatedDay = W.dayOf(S.t);
      if (b.letter !== false) W.keeperLetter((st === 'open' ? 'About your request' : 'Your request') + ' ("' + q.what.slice(0, 80) + '"): ' + ({ approved: 'yes.', declined: 'no.', modified: 'yes, but not quite as you asked.', fulfilled: 'it\'s done.', open: 'still thinking about it.' })[st] + (q.response ? ' ' + q.response : ''), 'request ' + q.id);
      return ok({ request: q });
    }
    case 'make': {
      const desc = str(b.description, 200), img = b.image ? parseDataURL(b.image) : null;
      if (!desc && !img) return send(res, 400, { error: 'Describe it or add a picture.' });
      if (b.image && !img) return send(res, 400, { error: 'That picture couldn\'t be read. Try a JPEG or PNG under 4 MB.' });
      const size = Math.max(1, Math.min(8, Number(b.size) || 3)), x = Number(b.x), z = Number(b.z);
      const prob = W.spotProblem(x, z, size * 0.7); if (prob) return send(res, 400, { error: prob });
      const th = W.addThing({ name: desc || 'something from a picture', desc, x, z, size, forRequest: str(b.forRequest, 20) });
      if (img) { th.file = 'uploads/' + th.id + '.' + img.ext; writeMedia(th.file, img.buf); }
      save(); send(res, 200, { ok: true, id: th.id });
      if (!canCall()) { th.status = 'failed'; W.bump(); return; }
      C.buildModel(desc || 'the thing in this picture', img ? { mediaType: img.mediaType, data: img.data } : null, size)
        .then(mm => { th.model = mm.parts; if (mm.name) th.name = mm.name; th.look = mm.look; th.label = mm.label; th.status = 'ready'; const q = th.forRequest && S.requests.find(r => r.id === th.forRequest); if (q) { q.status = 'fulfilled'; q.updatedDay = W.dayOf(S.t); } })
        .catch(e => { th.status = 'failed'; console.warn('[percy] building a model failed:', e.message); })
        .finally(() => { W.bump(); save(); });
      return;
    }
    case 'graffiti': {
      const img = parseDataURL(b.image); if (!img) return send(res, 400, { error: 'Draw something or add a picture first.' });
      const x = Number(b.x), y = Number(b.y), z = Number(b.z), nx = Number(b.nx), nz = Number(b.nz);
      if (![x, y, z, nx, nz].every(Number.isFinite)) return send(res, 400, { error: 'Tap a wall to paint on.' });
      const w = Math.max(0.6, Math.min(5, Number(b.w) || 2)), h = Math.max(0.4, Math.min(5, Number(b.h) || w));
      const g = { id: uid(), by: 'keeper', x, y, z, nx, nz, w, h, text: str(b.text, 80), look: 'paint on the wall' + (str(b.text, 80) ? ' with the words "' + str(b.text, 80) + '"' : ''), day: W.dayOf(S.t) };
      g.file = 'graffiti/' + g.id + '.' + img.ext; g.img = '/media/' + g.file; writeMedia(g.file, img.buf);
      S.graffiti.push(g); W.wlog('the keeper painted on a wall'); return ok({ id: g.id });
    }
    case 'stock': {
      const img = b.image ? parseDataURL(b.image) : null;
      const r = W.stockItem({ shop: b.shop, name: b.name, price: b.price, desc: b.desc }); if (r.error) return send(res, 400, { error: r.error });
      const it = r.item; if (img) { it.file = 'uploads/' + it.id + '.' + img.ext; it.img = '/media/' + it.file; writeMedia(it.file, img.buf); }
      save(); send(res, 200, { ok: true, id: it.id });
      if (!canCall()) { it.status = 'ready'; it.look = it.desc; W.bump(); return; }
      C.buildModel(it.name + (it.desc ? ', ' + it.desc : '') + ' (an item in a shop window)', img ? { mediaType: img.mediaType, data: img.data } : null, 0.9)
        .then(mm => { it.model = mm.parts; it.look = mm.look; it.status = 'ready'; }).catch(() => { it.status = 'ready'; it.look = it.desc; }).finally(() => { W.bump(); save(); });
      return;
    }
    case 'book': { // a book left in the library: an object he may or may not ever read
      const lib = S.town.places.find(pl => pl.type === 'library'); if (!lib) return send(res, 400, { error: 'There is no library.' });
      const topic = str(b.topic, 80); if (!topic) return send(res, 400, { error: 'What is the book called?' });
      const text = String(b.text || '').slice(0, 20000).trim();
      lib.inside = lib.inside || { feel: 'tall shelves, dust in the light from the windows, the smell of old paper', items: [] };
      lib.inside.items.push({ id: 'bk' + uid().slice(0, 5), name: 'a book: ' + topic, look: 'a book left on a reading table; the cover says "' + topic + '"', text: text || topic, canTake: true, examined: false, taken: false, book: true });
      W.wlog('the keeper left a book in the library: ' + topic); return ok();
    }
    case 'print-sold': { const r = W.buyDrawing(String(b.id || ''), { print: true, coins: config.printCoins }); if (r.error) return send(res, 400, { error: r.error }); return ok(); }
    case 'remove-graffiti': S.graffiti = S.graffiti.filter(g => g.id !== b.id); return ok();
    case 'remove-inside': { // take something out of a room (it was left there when the room was first described)
      const pl = W.placeById(b.place); const items = pl && pl.inside && pl.inside.items; if (!items) return send(res, 400, { error: 'No such room.' });
      const it = items.find(i => i.id === b.id); if (!it) return send(res, 400, { error: 'It isn\'t there.' });
      pl.inside.items = items.filter(i => i !== it); W.wlog('the keeper took ' + (it.name || 'something') + ' out of ' + pl.name); return ok();
    }
    case 'remove-item': S.items = S.items.filter(i => i.id !== b.id || i.sold); return ok();
    case 'remove-thing': W.removeThing(b.id); return ok();
    case 'remove-building': { const r = W.removeBuilding(String(b.id || '')); if (r.error) return send(res, 400, { error: r.error }); return ok(); }
    case 'give': { const coins = Math.round(Number(b.coins) || 0); if (coins < 1 || coins > 1000) return send(res, 400, { error: 'Between 1 and 1000 coins.' }); payIn({ coins, from: str(b.from, 40), message: str(b.message, 500), source: 'keeper', code: str(b.code, 10) }); return send(res, 200, { ok: true }); }
    case 'record-sale': { const l = S.shop.find(x => x.id === b.id && !x.sold); if (!l) return send(res, 400, { error: 'That isn\'t for sale any more.' }); payIn({ coins: l.price, from: str(b.from, 40), code: l.code, source: 'keeper' }); return send(res, 200, { ok: true }); }
    case 'remove-commission': S.commissions = S.commissions.filter(c => c.id !== b.id); return ok();
    case 'remove-note': S.notes = S.notes.filter(n => n.id !== b.id); return ok();
    case 'build': { const r = W.addBuilding({ kind: b.kind, name: b.name, desc: b.desc, x: Number(b.x), z: Number(b.z) }); if (r.error) return send(res, 400, { error: r.error }); return ok({ id: r.place.id }); }
    case 'grow': { const g = W.growTown('keeper'); return ok({ road: g.road }); }
  }
  return send(res, 404, { error: 'Unknown keeper action.' });
}

server.listen(config.port, async () => {
  console.log(`[percy] Mossbrook is open on port ${config.port}`);
  const b = budget();
  console.log('[percy] mind: ' + (config.apiKey ? `Claude (decisions ${config.modelDecide}, work ${config.modelWork}); today's limits: ${b.callsPerDay} calls, $${b.spendPerDay || '∞'}` : 'continuity rules only (no ANTHROPIC_API_KEY set)'));
  console.log('[percy] search: ' + searchVia() + (config.searxngUrl ? ' (SearXNG at ' + config.searxngUrl + ')' : '') + ' · browser: ' + (B.available() ? config.chromiumPath : 'none') + ' · git: ' + (await WS.hasGit() ? 'yes' : 'no'));
  console.log('[percy] website: ' + (Pub.enabled() ? 'publishing to ' + config.githubRepo + (config.autoPublish ? ' (he may publish on his own)' : ' (publishing needs approval)') : 'off'));
  console.log('[percy] keeper tools: ' + (config.keeperKey ? 'on' : 'off (set KEEPER_KEY)') + ' · ko-fi: ' + (config.kofiToken ? 'on' : 'off'));
  siteIndex();
});
