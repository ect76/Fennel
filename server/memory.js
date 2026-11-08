// Percy's memory: five linked kinds, each item tagged with where it came from (provenance).
//   episodic   what he experienced: where, when, what happened, the outcome
//   semantic   claims about the world, with provenance, sources and confidence
//   personal   preferences, opinions, associations, relationships, self-concept (each with its evidence)
//   procedural skills, tool use, what has actually worked
//   prospective intentions, open questions (requests and projects live in their own records)
// Retrieval scores relevance to the current situation, not just recency, so older formative episodes can come back.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { uid, clamp, str } from './util.js';

export const PROVENANCE = ['perceived', 'researched', 'told', 'inferred', 'imagined', 'initial', 'experienced'];
export function emptyMind() {
  return { episodic: [], semantic: [], personal: [], procedural: [], intentions: [], questions: [], ideas: [],
    knownPlaces: {}, knownThings: {}, roadsWalked: [], summaries: [] };
}

/* ---------- writing ---------- */
let M = null, clock = () => ({ t: 0, day: 1, time: '00:00' });
export function bind(mind, clockFn) { M = mind; clock = clockFn; }
const stamp = () => { const c = clock(); return { t: c.t, day: c.day, time: c.time }; };

export function episode({ what, where = '', outcome = '', kind = 'event', importance = 2, refs = {}, words = '' }) {
  const e = { id: 'e' + uid(), ...stamp(), kind, what: str(what, 600), where: str(where, 80), outcome: str(outcome, 600), words: str(words, 600), importance: clamp(Math.round(importance) || 2, 1, 5), refs };
  M.episodic.push(e); trimEpisodes(); return e;
}
export function claim({ text, about = '', provenance = 'inferred', sources = [], confidence = 0.6, from = '' }) {
  text = str(text, 400); if (!text) return null;
  if (!PROVENANCE.includes(provenance)) provenance = 'inferred';
  const dup = M.semantic.find(s => !s.superseded && s.text.toLowerCase() === text.toLowerCase());
  if (dup) { dup.confidence = clamp(Math.max(dup.confidence, confidence), 0, 1); for (const s of sources) if (!dup.sources.some(x => x.url === s.url)) dup.sources.push(s); dup.seenAgain = (dup.seenAgain || 0) + 1; return dup; }
  const c = { id: 's' + uid(), ...stamp(), text, about: str(about, 80), provenance, sources: sources.slice(0, 6), confidence: clamp(Number(confidence) || 0.5, 0, 1), from: str(from, 80) };
  M.semantic.push(c); if (M.semantic.length > 2500) archive('semantic', M.semantic.splice(0, M.semantic.length - 2500)); return c;
}
export function personal({ kind = 'opinion', text, evidence = [], replaces = '' }) {
  text = str(text, 300); if (!text) return null;
  const p = { id: 'p' + uid(), ...stamp(), kind: ['preference', 'opinion', 'association', 'relationship', 'self', 'feeling'].includes(kind) ? kind : 'opinion', text, evidence: evidence.slice(0, 8) };
  if (replaces) { const old = M.personal.find(x => x.id === replaces && !x.revisedBy); if (old) { old.revisedBy = p.id; p.revises = old.id; } } // keep the old view: it changed, it wasn't erased
  M.personal.push(p); if (M.personal.length > 800) archive('personal', M.personal.splice(0, M.personal.length - 800)); return p;
}
export function procedure({ skill, text, worked = true }) {
  text = str(text, 300); if (!text) return null;
  const p = { id: 'k' + uid(), ...stamp(), skill: str(skill, 60), text, worked: !!worked };
  M.procedural.push(p); if (M.procedural.length > 600) archive('procedural', M.procedural.splice(0, M.procedural.length - 600)); return p;
}
export function question({ text, origin = '' }) {
  text = str(text, 240); if (!text) return null;
  const ex = M.questions.find(q => q.status === 'open' && q.text.toLowerCase() === text.toLowerCase()); if (ex) return ex;
  const q = { id: 'q' + uid(), ...stamp(), text, origin: str(origin, 80), status: 'open' };
  M.questions.push(q); return q;
}
export function setQuestion(id, status, note = '') { const q = M.questions.find(x => x.id === id); if (q) { q.status = status; q.closedDay = clock().day; if (note) q.note = str(note, 300); } return q; }

// Intentions: what he has decided he wants, at any horizon. They persist across sleep, outages and detours.
export function intend({ text, why = '', horizon = 'today', project = '' }) {
  text = str(text, 240); if (!text) return null;
  const same = M.intentions.find(i => (i.status === 'active' || i.status === 'paused') && i.text.toLowerCase() === text.toLowerCase());
  if (same) { if (same.status === 'paused') updateIntention(same.id, { status: 'active' }); return same; }
  const i = { id: 'i' + uid(), ...stamp(), text, why: str(why, 300), horizon: ['now', 'today', 'days', 'long'].includes(horizon) ? horizon : 'today', status: 'active', project, history: [] };
  M.intentions.push(i); return i;
}
export function updateIntention(id, { status, text, why, note }) {
  const i = M.intentions.find(x => x.id === id); if (!i) return null;
  const c = stamp();
  if (text && text !== i.text) { i.history.push({ day: c.day, time: c.time, was: i.text }); i.text = str(text, 240); }
  if (why) i.why = str(why, 300);
  if (status && ['active', 'paused', 'done', 'abandoned'].includes(status)) { i.status = status; i.history.push({ day: c.day, time: c.time, status }); }
  if (note) i.history.push({ day: c.day, time: c.time, note: str(note, 240) });
  if (i.history.length > 40) i.history.splice(0, i.history.length - 40);
  i.updated = c.t; return i;
}
export const activeIntentions = () => M.intentions.filter(i => i.status === 'active');

/* ---------- forgetting (gently) ---------- */
// Nothing important is dropped. Old, minor episodes leave the working set (after a day summary exists) and go to an archive file.
function trimEpisodes() {
  if (M.episodic.length <= 3000) return;
  const day = clock().day;
  const keep = [], out = [];
  for (const e of M.episodic) (e.importance >= 3 || day - e.day < 14 || keep.length + (M.episodic.length - keep.length - out.length) <= 2500 ? keep : out).push(e);
  M.episodic = keep; archive('episodic', out);
}
function archive(kind, items) {
  if (!items.length) return;
  try { fs.mkdirSync(config.dataDir, { recursive: true }); fs.appendFileSync(path.join(config.dataDir, 'memory-archive.jsonl'), items.map(x => JSON.stringify({ kind, ...x })).join('\n') + '\n'); } catch {}
}

/* ---------- recall ---------- */
const STOP = new Set('the a an and or but of to in on at for with by from as is are was were be been it its this that these those i he his him you your my me we they them their there here what when where who why how not no yes do did does done have has had can could would should will just very so than then into onto over under about after before again more most some any all each other only own same too also out up down off'.split(' '));
const toks = s => (String(s || '').toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).map(w => w.replace(/(ing|ed|es|s)$/, '')).filter(w => w.length > 2 && !STOP.has(w));
function idf(items, field) {
  const df = new Map(); for (const it of items) for (const w of new Set(toks(field(it)))) df.set(w, (df.get(w) || 0) + 1);
  const n = items.length || 1; return w => Math.log(1 + n / (1 + (df.get(w) || 0)));
}
// query: text of the current situation; ids: entity ids present (places, things, projects) for direct links
function rank(items, field, query, { ids = [], k = 6, recency = 30, minScore = 0.15 } = {}) {
  if (!items.length) return [];
  const q = new Set(toks(query)), w = idf(items, field), now = clock().day, idset = new Set(ids.filter(Boolean));
  const scored = items.map(it => {
    let s = 0; for (const t of new Set(toks(field(it)))) if (q.has(t)) s += w(t);
    const refs = it.refs ? Object.values(it.refs).flat() : [];
    if (refs.some(r => idset.has(r)) || idset.has(it.about) || idset.has(it.project)) s += 3;
    s += (it.importance || 2) * 0.25 + (it.confidence || 0) * 0.3;
    s += Math.exp(-(now - (it.day || now)) / recency) * 0.6;
    if ((it.importance || 0) >= 4) s += 0.5; // formative experiences stay reachable
    return { it, s };
  }).filter(x => x.s >= minScore).sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map(x => x.it);
}
export function recall(query, ids = []) {
  const ep = rank(M.episodic, e => e.what + ' ' + e.outcome + ' ' + e.where + ' ' + e.words, query, { ids, k: 8 });
  const recent = M.episodic.slice(-6);
  return {
    recent, episodes: ep.filter(e => !recent.includes(e)),
    semantic: rank(M.semantic.filter(s => !s.superseded), s => s.text + ' ' + s.about, query, { ids, k: 10, recency: 90 }),
    personal: rank(M.personal.filter(p => !p.revisedBy), p => p.text + ' ' + p.kind, query, { ids, k: 6, recency: 120 }).concat(M.personal.filter(p => p.kind === 'self' && !p.revisedBy).slice(-2)).filter((x, i, a) => a.indexOf(x) === i),
    procedural: rank(M.procedural, p => p.skill + ' ' + p.text, query, { ids, k: 5, recency: 120 }),
    questions: rank(M.questions.filter(q => q.status === 'open'), q => q.text, query, { ids, k: 6, recency: 60, minScore: 0 }),
    summaries: M.summaries.slice(-3),
  };
}
export const counts = () => ({ episodic: M.episodic.length, semantic: M.semantic.length, personal: M.personal.length, procedural: M.procedural.length, intentions: M.intentions.filter(i => i.status === 'active').length, questions: M.questions.filter(q => q.status === 'open').length });
