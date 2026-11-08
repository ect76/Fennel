// Percy's server: runs his world nonstop, serves the 3D town page, and takes visitors' notes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { loadJSON, saveJSON, dailyBackup } from './store.js';
import { canCall } from './claude.js';
import * as W from './world.js';
import * as M from './mind.js';

const { str, pick, plainName } = W;
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const SAVE = path.join(config.dataDir, 'world.json');

/* ---------- load or create the world ---------- */
let S = loadJSON(SAVE);
if (!S || S.v !== 2) {
  S = W.newWorld(); W.setState(S);
  W.addDiary('event', 'day 1. woke up in the cottage. the stone was humming before the birds started.');
  console.log('[percy] a new world begins');
} else {
  W.setState(S);
  S.deciding = false;
  const gapMin = (Date.now() - (S.lastSeenReal || Date.now())) / 60000;
  if (gapMin > 10) { W.addDiary('event', 'the world went quiet for a while. i don\'t remember any of it. the clock says it\'s still ' + W.hhmm(S.t) + '.'); W.log('the world paused'); }
  console.log('[percy] world loaded: day ' + W.dayOf(S.t) + ', ' + W.hhmm(S.t));
}
function save() { S.lastSeenReal = Date.now(); try { saveJSON(SAVE, S); dailyBackup(config.dataDir, S); } catch (e) { console.error('[percy] save failed:', e.message); } }

/* ---------- things that need Claude and finish later ---------- */
// Results are attached to the activity; whichever comes last (the activity ending or Claude answering) publishes it.
function later(a, kind, promise) {
  a.job = { kind, done: false, ended: false };
  promise.then(r => { a.job.result = r; }).catch(e => { a.job.error = String(e.message || e); console.warn('[percy] ' + kind + ' failed:', a.job.error); })
    .finally(() => { a.job.done = true; if (a.job.ended) publish(a); });
}
function publish(a) {
  const j = a.job; if (!j || j.published) return; j.published = true;
  if (j.kind === 'research') {
    const r = j.result;
    if (r) {
      S.knowledge.push({ topic: r.topic, facts: r.facts, sources: r.sources, day: W.dayOf(S.t), src: 'claude', web: r.web });
      if (S.knowledge.length > 60) S.knowledge.shift();
      S.researchQueue = S.researchQueue.filter(q => q.topic.toLowerCase() !== String(a.subject || '').toLowerCase() && q.topic.toLowerCase() !== r.topic.toLowerCase());
      if (r.newQuestion) { S.questions.unshift(r.newQuestion); S.questions = S.questions.slice(0, 6); }
      W.addDiary('learn', 'read about ' + r.topic + '.\n' + r.facts.map(f => '· ' + f).join('\n') + (r.feeling ? '\n' + r.feeling : ''), 'claude', { sources: r.sources });
      W.remember('learned about ' + r.topic + ': ' + r.facts[0], 3);
      W.log('researched ' + r.topic);
    } else bookFallback();
  } else if (j.kind === 'page') {
    const r = j.result;
    if (r) {
      S.pages.push({ id: W.uid(), day: W.dayOf(S.t), title: r.title, body: r.body });
      if (S.pages.length > 60) S.pages.shift();
      W.addDiary('page', 'wrote a page called "' + r.title + '" and pinned it up.', 'claude');
      W.log('wrote a page: ' + r.title); W.remember('wrote a page called "' + r.title + '"', 2);
    } else W.log('tried to write but nothing came');
  }
  W.bump();
}
function bookFallback() {
  const b = W.builtinBook();
  if (b) { S.knowledge.push({ topic: b.topic, facts: b.facts, sources: [], day: W.dayOf(S.t), src: 'book' }); W.addDiary('learn', 'read about ' + b.topic + '.\n' + b.facts.map(f => '· ' + f).join('\n')); W.log('read about ' + b.topic); }
  else { W.log('reread an old book'); W.setThought('read the moon book again. still far.'); }
}

W.setHooks({
  onArrive(a) {
    const claude = canCall();
    if (a.id === 'read') {
      const q = S.researchQueue[0];
      const topic = a.subject || (q && q.topic) || '';
      if (claude && topic) { a.subject = topic; later(a, 'research', M.research(topic, q && q.topic === topic ? q.question : '')); W.setThought('looking up ' + topic + '.'); }
    }
    if (a.id === 'write' && claude) later(a, 'page', M.writePage(a.subject, a.title));
    if (a.id === 'shrine') readNotes(claude);
    if (a.id === 'inspect') { const th = W.thingById(a.thing); if (th && !th.seen) firstLook(th, claude); }
    if (claude && a.total >= 60 && Math.random() < 0.65) a.museAt = a.total * (0.35 + Math.random() * 0.3);
    if (claude && a.id === 'sleep') a.museAt = a.total * 0.5;
  },
  onFinish(a) {
    if (a.job) { a.job.ended = true; if (a.job.done) publish(a); }
    else if (a.id === 'read') bookFallback();
    if (a.id === 'draw') {
      const dr = M.makeDrawing(a.subject, a.title);
      W.addDiary('drawing', 'drew "' + dr.title + '". ' + pick(['it came out wobbly. i like it anyway.', 'not sure about the left side.', 'pinned it on the wall.', 'it looks like how it felt.']));
      W.log('drew "' + dr.title + '"');
    }
    if (a.id === 'fog' && (S.fogTests <= 3 || S.fogTests % 3 === 0)) {
      W.addDiary('fog', pick(['walked to the end of ' + (a.road || 'the road') + ' until my feet stopped. not tired. just stopped.', 'pushed into the fog with one hand. soft, like a wall made of pillows.', 'threw a pebble into the fog. no sound when it landed.', 'stood where ' + (a.road || 'the road') + ' runs out for a long time. nothing out there looked back.']) + ' test #' + S.fogTests + '.');
    }
  },
  onDiscover(p) {
    const plain = { first_sight: 'found ' + p.name + '. nobody there. the door ' + pick(['was open', 'was locked', 'had a bell that didn\'t ring']) + '.', question: 'who built ' + p.name + '?', wonder: 8 };
    const done = (r, src) => { W.applyFeel(r); W.addDiary('found', str(r.first_sight, 700), src); if (str(r.question, 160)) { S.questions.unshift(str(r.question, 160)); S.questions = S.questions.slice(0, 6); } if (str(r.remember, 220)) W.remember(r.remember, 3); W.bump(); };
    if (canCall()) M.reactToPlace(p).then(r => done(r, 'claude')).catch(() => done(plain, 'rules')); else done(plain, 'rules');
  },
  onGrow(g, by) {
    W.addDiary('event', by === 'keeper' ? 'woke up with the feeling the town had got bigger in the night.' : 'the fog looks thinner down ' + (g.road || 'one of the roads') + ' today.');
  },
  onBedtime(day) {
    if (!canCall()) return;
    M.reflect(day).then(() => { W.bump(); save(); }).catch(e => console.warn('[percy] reflection failed:', e.message));
  },
});

function readNotes(claude) {
  const unread = S.notes.filter(n => !n.read);
  if (!unread.length) { W.log('visited the Humming Stone. no notes'); return; }
  for (const n of unread) {
    n.read = true; n.readDay = W.dayOf(S.t); S.stats.notes++; W.log('found a note at the Humming Stone');
    const done = (r, src) => {
      n.reaction = { reaction: str(r.reaction, 600) };
      W.applyFeel(r);
      if (str(r.belief, 140)) { S.beliefs.unshift(str(r.belief, 140)); S.beliefs = S.beliefs.slice(0, 8); }
      if (str(r.remember, 220)) W.remember(r.remember, 3);
      W.addDiary('note', 'found a note under the stone' + (n.from ? ', signed ' + n.from : '') + ':\n“' + n.text + '”\n' + n.reaction.reaction, src);
    };
    const plain = { reaction: pick(['i read it three times. i don\'t know who wrote it but i\'m keeping it.', 'someone out there knows i\'m here. that\'s a lot to think about.', 'i folded it small and took it home.']), joy: 7, wonder: 8 };
    if (claude) M.reactToNote(n).then(r => done(r, 'claude')).catch(() => done(plain, 'rules'));
    else done(plain, 'rules');
  }
  W.setThought('a note! someone was here.');
}
function firstLook(th, claude) {
  th.seen = true; th.noticed = true; th.seenDay = W.dayOf(S.t); S.lastThing = th.id;
  const nm = plainName(th.name);
  const done = (r, src) => {
    W.applyFeel(r);
    W.addDiary('thing', str(r.first_sight, 600), src);
    if (str(r.question, 160)) { S.questions.unshift(str(r.question, 160)); S.questions = S.questions.slice(0, 6); }
    if (str(r.research_topic, 60)) { S.researchQueue.push({ topic: str(r.research_topic, 60), question: str(r.question, 160) }); if (S.researchQueue.length > 6) S.researchQueue.shift(); }
    if (str(r.remember, 220)) W.remember(r.remember, 3);
    W.bump();
  };
  const plain = { first_sight: 'there\'s a ' + nm + ' near ' + W.nearPlace(th.x, th.z) + '. it wasn\'t there before. nobody saw who brought it.', question: 'who put the ' + nm + ' here?', research_topic: nm, wonder: 10 };
  if (claude) M.reactToThing(th).then(r => done(r, 'claude')).catch(() => done(plain, 'rules'));
  else done(plain, 'rules');
}

/* ---------- deciding what to do next ---------- */
let decisionToken = 0;
function requestDecision() {
  S.deciding = true; W.bump();
  const token = ++decisionToken;
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('took too long')), 75000));
  Promise.race([M.decide(), timeout])
    .then(dec => { if (token === decisionToken && !S.act) W.startAct(dec); })
    .catch(e => { if (token === decisionToken && !S.act) { if (config.apiKey) console.warn('[percy] decision fell back to rules:', e.message); W.startAct(W.ruleDecision()); } })
    .finally(() => { if (token === decisionToken) S.deciding = false; });
}

/* ---------- the clock ---------- */
let last = Date.now(), lastSave = Date.now();
setInterval(() => {
  const now = Date.now(); const dt = Math.min(5, (now - last) / 1000); last = now;
  W.tick(dt, requestDecision);
  const a = S.act;
  if (a && a.phase === 'do' && a.museAt && !a.mused && a.total - a.left >= a.museAt) { a.mused = true; M.muse().catch(() => {}); }
  if (now - lastSave > 30000) { lastSave = now; save(); }
}, 250);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

/* ---------- web server ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const streams = new Set();
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const lastNoteBy = new Map();

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > 10000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); } });
  });
}
function keeperOK(key) {
  if (!config.keeperKey || typeof key !== 'string') return false;
  const a = crypto.createHash('sha256').update(key).digest(), b = crypto.createHash('sha256').update(config.keeperKey).digest();
  return crypto.timingSafeEqual(a, b);
}
const extra = () => ({ mind: M.status(), watchers: streams.size, keeper: !!config.keeperKey, deciding: S.deciding });
function live() {
  return { t: S.t, day: W.dayOf(S.t), time: W.hhmm(S.t), pos: S.pos, face: S.face, act: S.act ? { id: S.act.id, phase: S.act.phase } : null,
    doing: W.doingText(), thought: S.thought, needs: S.needs, mood: W.moodWord(), coins: S.coins, weather: S.weather.kind,
    season: W.seasonOf(W.dayOf(S.t)), rev: S.rev, watchers: streams.size, deciding: S.deciding, scale: config.timeScale };
}
setInterval(() => { M.setWatchers(streams.size); const msg = 'data: ' + JSON.stringify(live()) + '\n\n'; for (const r of streams) r.write(msg); }, 1000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/state') return send(res, 200, W.publicState(extra()));
    if (req.method === 'GET' && p === '/api/live') return send(res, 200, live());
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, day: W.dayOf(S.t), time: W.hhmm(S.t), ...M.status() });
    if (req.method === 'GET' && p === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n'); streams.add(res);
      req.on('close', () => streams.delete(res)); return;
    }
    if (req.method === 'POST' && p === '/api/notes') {
      const b = await readBody(req); const text = str(b.text, 280), from = str(b.from, 30);
      if (!text) return send(res, 400, { error: 'Write something first.' });
      const ip = ipOf(req), lastAt = lastNoteBy.get(ip) || 0;
      if (Date.now() - lastAt < 90000) return send(res, 429, { error: 'One note at a time. Try again in a minute or two.' });
      if (S.notes.filter(n => !n.read).length >= 15) return send(res, 429, { error: 'The stone is full of unread notes. Try again after he visits.' });
      lastNoteBy.set(ip, Date.now());
      S.notes.unshift({ id: W.uid(), text, from, day: W.dayOf(S.t), read: false });
      if (S.notes.length > 80) S.notes.pop();
      W.bump(); save(); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p.startsWith('/api/keeper/')) {
      const b = await readBody(req);
      if (!config.keeperKey) return send(res, 403, { error: 'Keeper tools are off. Set KEEPER_KEY in the container settings to use them.' });
      if (!keeperOK(b.key)) return send(res, 403, { error: 'That keeper key is wrong.' });
      const what = p.slice('/api/keeper/'.length);
      if (what === 'check') return send(res, 200, { ok: true });
      if (what === 'thing') {
        const name = str(b.name, 40); if (!name) return send(res, 400, { error: 'Give it a name.' });
        const x = Number(b.x), z = Number(b.z); const prob = W.spotProblem(x, z); if (prob) return send(res, 400, { error: prob });
        const th = W.addThing({ kind: b.kind, name, desc: b.desc, x, z }); save(); return send(res, 200, { ok: true, id: th.id });
      }
      if (what === 'remove-thing') { S.things = S.things.filter(t => t.id !== b.id); W.log('something vanished from town'); W.bump(); save(); return send(res, 200, { ok: true }); }
      if (what === 'remove-note') { S.notes = S.notes.filter(n => n.id !== b.id); W.bump(); save(); return send(res, 200, { ok: true }); }
      if (what === 'build') {
        const r = W.addBuilding({ kind: b.kind, name: b.name, desc: b.desc, x: Number(b.x), z: Number(b.z) });
        if (r.error) return send(res, 400, { error: r.error });
        save(); return send(res, 200, { ok: true, id: r.place.id });
      }
      if (what === 'grow') { const g = W.growTown('keeper'); save(); return send(res, 200, { ok: true, road: g.road }); }
      if (what === 'book') {
        const topic = str(b.topic, 60); if (!topic) return send(res, 400, { error: 'What is the book about?' });
        S.researchQueue.unshift({ topic, question: '' }); S.researchQueue = S.researchQueue.slice(0, 6);
        W.log('someone left a book about ' + topic + ' at the library'); W.bump(); save(); return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Unknown keeper action.' });
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'no', 'text/plain');
      fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, 'not found', 'text/plain');
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: e.message === 'too large' ? 'That was too long.' : 'Something about that request was off.' });
  }
});
server.listen(config.port, () => {
  console.log(`[percy] Mossbrook is open on port ${config.port}`);
  console.log('[percy] mind: ' + (config.apiKey ? `Claude (${config.modelThink} / ${config.modelReflect})` : 'simple rules only (no ANTHROPIC_API_KEY set)'));
  console.log('[percy] keeper tools: ' + (config.keeperKey ? 'on' : 'off (set KEEPER_KEY to turn on)'));
});
