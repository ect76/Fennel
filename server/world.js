// Fennel's world: places, needs, time, weather, events, and the mechanics of doing things.
// The "mind" (mind.js) decides what he does; this file makes it happen.
import { config } from './config.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const uid = () => Math.random().toString(36).slice(2, 10);
export const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
export const plainName = n => String(n).replace(/^(a|an|the)\s+/i, '').trim() || 'thing';

const WALK_SPEED = 2.4; // island units per real second, so walking looks natural at any time scale

export const PLACES = {
  square: { name: 'the town square', bx: 0, bz: 0, depth: 0 },
  home: { name: 'his cottage', bx: -10, bz: 8, depth: 4.6 },
  bakery: { name: 'the bakery', bx: 9, bz: -7, depth: 4.2, open: [7, 19] },
  market: { name: 'the market stall', bx: 11, bz: 4, depth: 2.4, open: [8, 16] },
  library: { name: 'the library', bx: -4, bz: -12.5, depth: 5, open: [9, 18] },
  pond: { name: 'the pond', bx: 3, bz: 11.5, depth: 8 },
  lookout: { name: 'the lookout hill', bx: -15, bz: -4, depth: 0 },
  shrine: { name: 'the Humming Stone', bx: 13, bz: -12, depth: 2.6 },
  rim: { name: 'the east rim', bx: 20.6, bz: 0, depth: 0 },
};
for (const k in PLACES) {
  const p = PLACES[k];
  if (p.depth) { const L = Math.hypot(p.bx, p.bz), off = p.depth / 2 + 1.4; p.tx = p.bx - p.bx / L * off; p.tz = p.bz - p.bz / L * off; }
  else { p.tx = p.bx; p.tz = p.bz; }
}
PLACES.square.tz = 2.8;

export const ACTIONS = {
  sleep: { place: 'home', label: 'sleeping', gain: { energy: 100, calm: 10 }, desc: 'go home to bed for the night' },
  nap: { place: 'home', label: 'napping', dur: 80, gain: { energy: 30 }, desc: 'a short nap at home' },
  eat: { place: 'bakery', label: 'eating bread', dur: 30, gain: { fullness: 45, joy: 6 }, desc: 'buy and eat bread at the bakery (2 coins)' },
  flies: { place: 'pond', label: 'catching flies', dur: 40, gain: { fullness: 18, calm: 4 }, desc: 'catch flies at the pond (free food)' },
  draw: { place: 'home', label: 'drawing', dur: 90, gain: { joy: 12, energy: -6, wonder: -4 }, desc: 'draw something at his desk (say what in "subject")' },
  write: { place: 'home', label: 'writing a page', dur: 80, gain: { joy: 8, energy: -4, wonder: -3 }, desc: 'write a page to pin up for visitors: a guide, a list, a log, an observation (say what in "subject")', claude: true },
  sell: { place: 'market', label: 'selling drawings', dur: 50, gain: {}, desc: 'try to sell drawings at the market stall' },
  read: { place: 'library', label: 'reading', dur: 90, gain: { wonder: 20, energy: -4 }, desc: 'read and research at the library (put the topic in "subject")' },
  pond: { place: 'pond', label: 'sitting by the pond', dur: 60, gain: { calm: 22, joy: 4 }, desc: 'sit quietly by the pond' },
  stargaze: { place: 'lookout', label: 'watching the stars', dur: 90, gain: { wonder: 24, calm: 8 }, desc: 'watch the stars from the lookout hill (night only)' },
  shrine: { place: 'shrine', label: 'at the Humming Stone', dur: 30, gain: { wonder: 8 }, desc: 'visit the Humming Stone and check for notes from visitors' },
  rim: { place: 'rim', label: 'testing the edge of the world', dur: 50, gain: { wonder: 14 }, desc: 'go to the east rim and test the edge of the world' },
  wander: { place: 'square', label: 'wandering', dur: 40, gain: { wonder: 5, joy: 2 }, desc: 'wander around the square' },
  explore: { place: null, label: 'exploring', dur: 45, gain: { wonder: 10, energy: -3 }, desc: 'explore a quiet corner of the island' },
  tidy: { place: 'home', label: 'tidying the cottage', dur: 40, gain: { calm: 12 }, desc: 'tidy the cottage' },
  inspect: { place: null, label: 'looking closely at something', dur: 45, gain: { wonder: 16, joy: 4 }, desc: 'go and look closely at something visitors added to town (give its id as "target")' },
};
export const ACTION_IDS = Object.keys(ACTIONS);

export const KINDS = {
  statue: 'Statue', lighthouse: 'Lighthouse', telescope: 'Telescope', mushrooms: 'Mushroom ring', phonebox: 'Phone box',
  crate: 'Mystery crate', sign: 'Signpost', tree: 'Blossom tree', bench: 'Bench', train: 'Little train',
};

const BOOKS = [
  { topic: 'the moon', facts: ['the moon is about 384,000 km away. further than the rim, probably.', 'it always shows the same face to us.'] },
  { topic: 'frogs', facts: ['frogs can breathe through their skin.', 'a group of frogs is sometimes called an army.'] },
  { topic: 'bread', facts: ['bread rises because yeast makes tiny bubbles of gas.', 'people have baked bread for over ten thousand years.'] },
  { topic: 'stars', facts: ['stars are huge balls of hot gas, very far away.', 'the light from some of them left long before anyone saw it.'] },
  { topic: 'moss', facts: ['moss has no proper roots. it holds on with threads called rhizoids.', 'some moss can dry out completely and wake up again with rain.'] },
];

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const WEATHER = {
  spring: [['clear', 4], ['cloudy', 3], ['rain', 3], ['fog', 1], ['wind', 1]],
  summer: [['clear', 6], ['cloudy', 2], ['rain', 1], ['wind', 1]],
  autumn: [['cloudy', 3], ['rain', 3], ['fog', 3], ['wind', 2], ['clear', 2]],
  winter: [['cloudy', 3], ['snow', 3], ['fog', 2], ['clear', 2], ['wind', 1]],
};
const EVENTS = [
  { id: 'bread', text: () => 'the bakery has a new loaf today: ' + pick(['seeded rye', 'honey buns', 'tiny pretzels', 'something with figs in it']) + '.' },
  { id: 'bakery_shut', text: () => 'the bakery has a sign on the door: "gone fishing". it is shut all day.' },
  { id: 'fountain', text: () => 'the fountain in the square has stopped running.' },
  { id: 'parcel', text: () => 'there is a small parcel by the cottage door, with no name on it. inside: ' + pick(['a packet of seeds', 'a blank notebook', 'a brass key that fits nothing', 'a ribbon the colour of the pond', 'a smooth grey pebble']) + '.' },
  { id: 'bird', text: () => 'a big bird flew low over the island and kept going past the rim.' },
  { id: 'hum', text: () => 'the Humming Stone is humming a different note today, lower than usual.' },
  { id: 'coin', text: () => 'there is a coin lying between the cobbles in the square.', coin: true },
  { id: 'busy', text: () => 'it is market day: more people than usual are passing the stall.' },
  { id: 'flicker', text: () => 'the lamps around the square keep flickering.' },
  { id: 'echo', text: () => 'from the east rim, every so often, there is a sound like an echo of a voice.' },
  { id: 'star', text: () => 'last night one star seemed to move across the sky, then stop.' },
];

export let S = null;
export const setState = s => { S = s; };

export function newWorld() {
  return {
    v: 1, created: Date.now(), t: 7 * 60, lastDay: 1, lastHour: 7, coins: 6, rev: 1,
    needs: { fullness: 72, energy: 85, wonder: 58, joy: 60, calm: 64 },
    pos: { x: PLACES.home.tx, z: PLACES.home.tz }, face: 0, act: null, recent: [], deciding: false, lastFail: '',
    thought: { text: 'morning. the square is quiet.', src: 'rules' }, recentThoughts: [],
    self: {
      description: 'A small green frog who lives in the cottage by the square in Mossbrook. He likes the pond at dusk and warm bread. He has never been past the mist at the east rim.',
      likes: ['the pond at dusk', 'warm bread'], fears: ['thunder'], obsession: '',
    },
    traits: { curiosity: 0.65, creativity: 0.7 },
    beliefs: ['the island is the whole world', 'the stone hums louder at night'],
    goals: [{ text: 'draw something every day', action: 'draw' }],
    leanings: {}, questions: ['what is past the mist?'],
    knowledge: [], researchQueue: [], memories: [],
    diary: [], drawings: [], pages: [], notes: [], things: [],
    dayLog: { 1: [] }, stats: newStats(), visited: {}, rimTests: 0,
    weather: { kind: 'clear', until: 12 * 60 }, events: [], pendingReflection: [],
    lastSeenReal: Date.now(),
  };
}
const newStats = () => ({ ate: 0, flies: 0, drew: 0, wrote: 0, sold: 0, read: 0, rim: 0, notes: 0, things: 0, closed: 0 });

/* ---------- time ---------- */
export const dayOf = t => Math.floor(t / 1440) + 1;
export const hourOf = t => (t % 1440) / 60;
export const hhmm = t => { const m = Math.floor(t % 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const seasonOf = d => SEASONS[Math.floor((d - 1) / 7) % 4];
export const isNight = h => h >= 21.5 || h < 6;
export function isOpen(pk, h) {
  if (pk === 'bakery' && S.events.some(e => e.id === 'bakery_shut')) return false;
  const o = PLACES[pk] && PLACES[pk].open; return !o || (h >= o[0] && h < o[1]);
}

/* ---------- records ---------- */
export function bump() { S.rev++; }
export function log(text) {
  const d = dayOf(S.t);
  (S.dayLog[d] = S.dayLog[d] || []).push(hhmm(S.t) + ' ' + text);
  if (S.dayLog[d].length > 80) S.dayLog[d].shift();
}
export function addDiary(kind, text, src = 'rules', extra = {}) {
  S.diary.push({ id: uid(), day: dayOf(S.t), time: hhmm(S.t), kind, text: String(text), src, ...extra });
  if (S.diary.length > 400) S.diary.splice(0, S.diary.length - 400);
  bump();
}
export function remember(text, importance = 2) {
  text = str(text, 220); if (!text) return;
  S.memories.push({ text, importance: clamp(Number(importance) || 2, 1, 5), day: dayOf(S.t) });
  if (S.memories.length > 500) {
    // forget the least important old memories first
    S.memories.sort((a, b) => (b.importance * 3 + b.day * 0.2) - (a.importance * 3 + a.day * 0.2));
    S.memories.length = 450;
  }
}
export function setThought(text, src = 'rules') {
  S.thought = { text: String(text), src };
  if (src === 'claude') { S.recentThoughts.push(String(text)); if (S.recentThoughts.length > 8) S.recentThoughts.shift(); }
}
export function feel(k, v) { S.needs[k] = clamp(S.needs[k] + v, 0, 100); }
export function applyFeel(r) { if (!r) return; for (const k of ['joy', 'calm', 'wonder']) { const v = Number(r[k]); if (Number.isFinite(v)) feel(k, clamp(v, -12, 12)); } }
export const thingById = id => S.things.find(t => t.id === id);
export const unsold = () => S.drawings.filter(d => !d.sold);
export function nearPlace(x, z) { let b = 'the square', bd = 1e9; for (const k in PLACES) { const p = PLACES[k]; const d = Math.hypot(p.bx - x, p.bz - z); if (d < bd) { bd = d; b = p.name; } } return b; }
export function moodWord() {
  const n = S.needs;
  if (n.fullness < 22) return 'hungry'; if (n.energy < 18) return 'sleepy'; if (n.calm < 32) return 'jittery';
  if (n.wonder < 25) return 'bored'; if (n.joy > 74) return 'happy'; if (n.wonder > 74) return 'curious'; if (n.joy < 32) return 'low';
  return 'content';
}
export function whereIs() {
  let best = 'out on the island', bd = 3.5;
  for (const k in PLACES) { const p = PLACES[k]; const d = Math.hypot(p.tx - S.pos.x, p.tz - S.pos.z); if (d < bd) { bd = d; best = 'at ' + p.name; } }
  return best;
}
export function doingText() {
  const a = S.act;
  if (!a) return S.deciding ? 'stopping to think' : 'deciding what to do';
  if (a.doing && a.phase === 'do') return a.doing;
  const A = ACTIONS[a.id];
  if (a.id === 'inspect') { const th = thingById(a.thing); const nm = th ? 'the ' + plainName(th.name) : 'something'; return a.phase === 'walk' ? 'going to look at ' + nm : 'looking closely at ' + nm; }
  if (a.phase === 'walk') return a.id === 'wander' || a.id === 'explore' ? A.label : 'heading to ' + PLACES[A.place].name + (a.doing ? ' (' + a.doing + ')' : '');
  return A.label + (A.place && a.id !== 'wander' ? ' at ' + PLACES[A.place].name : '');
}

/* ---------- needs ---------- */
function decay(mins, asleep) {
  const n = S.needs, w = S.weather.kind;
  n.fullness -= (asleep ? 1.6 : 4) / 60 * mins;
  if (!asleep) n.energy -= 3.4 / 60 * mins;
  n.wonder -= 2.4 / 60 * mins;
  n.joy += (50 - n.joy) * 0.0012 * mins;
  n.calm += (55 - n.calm) * 0.0012 * mins;
  if (n.fullness < 25) { n.joy -= 2 / 60 * mins; n.calm -= 3 / 60 * mins; }
  if (n.energy < 20) n.calm -= 2 / 60 * mins;
  if (n.wonder < 25) n.joy -= 1 / 60 * mins;
  if (!asleep && (w === 'rain' || w === 'snow') && outdoors()) n.calm -= 1.5 / 60 * mins;
  for (const k in n) n[k] = clamp(n[k], 0, 100);
}
function outdoors() { const a = S.act; return !a || !['sleep', 'nap', 'draw', 'write', 'read', 'tidy', 'eat'].includes(a.id) || a.phase === 'walk'; }

/* ---------- simple rules (used when Claude is off, over budget or slow) ---------- */
function bestThing() {
  let best = null, bs = -1e9;
  for (const th of S.things) { let s = th.seen ? (0.25 - th.inspections * 0.12 + (th.liked ? 0.3 : 0)) : (2.2 + S.traits.curiosity); s += Math.random() * 0.2; if (s > bs) { bs = s; best = th; } }
  return best ? { s: bs, thing: best.id } : null;
}
export function available(id, h = hourOf(S.t)) {
  const A = ACTIONS[id], n = S.needs, night = isNight(h);
  if (A.place && A.place !== 'home' && !isOpen(A.place, h)) return false;
  switch (id) {
    case 'sleep': return night || n.energy < 15;
    case 'nap': return !night && n.energy < 45;
    case 'eat': return S.coins >= 2;
    case 'flies': return !night && !(seasonOf(dayOf(S.t)) === 'winter' && S.weather.kind === 'snow');
    case 'sell': return unsold().length > 0;
    case 'stargaze': return (h >= 20 || h < 4) && S.weather.kind !== 'fog';
    case 'inspect': return S.things.length > 0;
    case 'write': return false; // needs Claude; the mind enables it itself
    default: return true;
  }
}
function ruleScore(id, h) {
  if (!available(id, h)) return -1e9;
  const n = S.needs, night = isNight(h), tr = S.traits, wet = ['rain', 'snow'].includes(S.weather.kind);
  let s;
  switch (id) {
    case 'sleep': s = night ? 3 + (100 - n.energy) * 0.02 : 2.5; if (h >= 6 && h < 9 && n.energy > 60) return -1e9; break;
    case 'nap': s = 0.8 + (45 - n.energy) * 0.05; break;
    case 'eat': s = (100 - n.fullness) * 0.035; break;
    case 'flies': s = (100 - n.fullness) * 0.022 + (S.coins < 2 ? 0.4 : 0); break;
    case 'draw': s = 0.7 + tr.creativity * 0.6 + (100 - n.joy) * 0.006 + (wet ? 0.3 : 0) - (n.energy < 25 ? 0.6 : 0) - S.stats.drew * 0.45; break;
    case 'sell': s = 0.3 + unsold().length * 0.25 + (S.coins < 4 ? 0.8 : 0) + (S.events.some(e => e.id === 'busy') ? 0.5 : 0); break;
    case 'read': s = (100 - n.wonder) * 0.02 + tr.curiosity * 0.5 + (S.researchQueue.length ? 1.2 : 0) + (wet ? 0.3 : 0); break;
    case 'pond': s = (100 - n.calm) * 0.025 + 0.3 - (wet ? 0.4 : 0); break;
    case 'stargaze': s = 0.6 + (100 - n.wonder) * 0.018; break;
    case 'shrine': s = 0.3 + S.notes.filter(x => !x.read).length * 1.6 + (n.wonder < 40 ? 0.45 : 0); break;
    case 'rim': s = n.wonder < 40 ? 0.6 + tr.curiosity * 0.8 + (40 - n.wonder) * 0.03 : 0.05; if (S.weather.kind === 'fog') s += 0.3; break;
    case 'wander': s = 0.45 + (n.wonder < 35 ? 0.3 : 0) - (wet ? 0.3 : 0); break;
    case 'explore': s = 0.3 + tr.curiosity * 0.4 - (wet ? 0.3 : 0); break;
    case 'tidy': s = 0.25 + (n.calm < 45 ? 0.4 : 0); break;
    case 'inspect': { const b = bestThing(); if (!b) return -1e9; return b.s - (night ? 0.5 : 0) + (Number(S.leanings.inspect) || 0) * 0.45; }
  }
  if (night && !['sleep', 'stargaze', 'pond'].includes(id)) s -= 1;
  s -= S.recent.slice(-5).filter(r => r === id).length * 0.45;
  s += (Number(S.leanings[id]) || 0) * 0.45;
  if (S.goals.some(g => g.action === id)) s += 0.35;
  return s + Math.random() * 0.35;
}
const RULE_THOUGHTS = {
  sleep: ['eyes heavy. home.', 'the lamps are on. bed.'], nap: ['legs feel like wet leaves. short nap.'],
  eat: ['bread. now.', 'stomach is making the pond noise.'], flies: ['the pond has free lunch.'],
  draw: ['an idea. going home before it leaves.'], sell: ['maybe someone wants a drawing today.'],
  read: ['want to know something new.'], pond: ['need the pond for a bit.'], stargaze: ['clear night. up the hill.'],
  shrine: ['the stone is humming. can feel it from here.'], rim: ['going east until something stops me.'],
  wander: ['no plan. just walking.'], explore: ['haven\'t been round that side for a while.'], tidy: ['the cottage is a mess. so am i.'],
  inspect: ['something new over there.'],
};
export function ruleDecision() {
  const h = hourOf(S.t); let best = 'wander', bs = -1e9, bt = null;
  for (const id of ACTION_IDS) {
    const s = id === 'inspect' ? ruleScore(id, h) : ruleScore(id, h);
    if (s > bs) { bs = s; best = id; bt = id === 'inspect' ? (bestThing() || {}).thing : null; }
  }
  return { action: best, target: bt, thought: pick(RULE_THOUGHTS[best] || ['hm.']), src: 'rules' };
}

/* ---------- carrying out decisions ---------- */
function targetFor(a) {
  if (a.id === 'inspect') { const th = thingById(a.thing); if (th) { const L = Math.hypot(th.x, th.z) || 1; return { x: th.x - th.x / L * 1.7, z: th.z - th.z / L * 1.7 }; } }
  if (a.id === 'wander') { const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6; return { x: Math.cos(ang) * r, z: Math.sin(ang) * r }; }
  if (a.id === 'explore') {
    for (let i = 0; i < 40; i++) { const ang = Math.random() * Math.PI * 2, r = 8 + Math.random() * 10; const x = Math.cos(ang) * r, z = Math.sin(ang) * r; if (!Object.values(PLACES).some(p => Math.hypot(p.bx - x, p.bz - z) < 4)) return { x, z }; }
    return { x: -5, z: 15 };
  }
  const p = PLACES[ACTIONS[a.id].place]; return { x: p.tx, z: p.tz };
}
export function startAct(dec) {
  let id = ACTIONS[dec.action] ? dec.action : 'wander';
  if (id === 'inspect' && !thingById(dec.target)) { const b = bestThing(); if (b) dec.target = b.thing; else id = 'wander'; }
  const a = { id, phase: 'walk', thing: id === 'inspect' ? dec.target : null, doing: str(dec.doing, 80), subject: str(dec.subject, 80), src: dec.src || 'rules' };
  const tg = targetFor(a); a.tx = tg.x; a.tz = tg.z;
  S.act = a; S.recent.push(id); if (S.recent.length > 10) S.recent.shift();
  if (dec.thought) setThought(dec.thought, dec.src === 'claude' ? 'claude' : 'rules');
  S.lastFail = '';
  bump();
}
function durFor(id, h) {
  if (id === 'sleep') { if (h >= 20) return Math.round((24 - h + 7) * 60); if (h < 7) return Math.max(60, Math.round((7 - h) * 60)); return 240; }
  return ACTIONS[id].dur;
}
function fail(a, why, thought) {
  S.lastFail = why; log(why); feel('calm', -5); feel('joy', -3); setThought(thought || why);
  S.act = null; bump();
}

let hooks = { onArrive: () => {}, onFinish: () => {}, onBedtime: () => {}, onHour: () => {} };
export const setHooks = h => { hooks = { ...hooks, ...h }; };

function arrive(a) {
  const A = ACTIONS[a.id], h = hourOf(S.t);
  if (A.place && !isOpen(A.place, h)) {
    S.stats.closed++;
    if (S.stats.closed === 1) addDiary('event', 'walked all the way to ' + PLACES[A.place].name + '. shut. i should read the sign properly.');
    return fail(a, PLACES[A.place].name + ' was closed', PLACES[A.place].name + ' is shut. walked all that way.');
  }
  if (a.id === 'eat' && S.coins < 2) return fail(a, 'not enough coins for bread', 'not enough coins. flies, then.');
  if (a.id === 'sell' && !unsold().length) return fail(a, 'had nothing to sell', 'nothing to sell. need to draw more.');
  if (a.id === 'inspect' && !thingById(a.thing)) return fail(a, 'the thing he went to see was gone', 'it\'s gone. was it ever there?');
  a.phase = 'do'; a.total = a.left = durFor(a.id, h);
  if (a.id === 'inspect') { const th = thingById(a.thing); S.face = Math.atan2(th.x - S.pos.x, th.z - S.pos.z); }
  else if (A.place && PLACES[A.place].depth) { const p = PLACES[A.place]; S.face = Math.atan2(p.bx - S.pos.x, p.bz - S.pos.z); }
  if (A.place) { const pk = A.place; S.visited[pk] = (S.visited[pk] || 0) + 1; }
  if (a.id === 'sleep' && (h >= 20 || h < 5)) bedtime(h);
  hooks.onArrive(a);
  bump();
}
function bedtime(h) {
  const d = h < 12 ? dayOf(S.t) - 1 : dayOf(S.t); if (d < 1) return;
  const st = S.stats, parts = [];
  if (st.ate) parts.push('ate bread ' + (st.ate === 1 ? 'once' : st.ate + ' times'));
  if (st.flies) parts.push('caught flies');
  if (st.drew) parts.push('drew ' + (st.drew === 1 ? 'one picture' : st.drew + ' pictures'));
  if (st.wrote) parts.push('wrote ' + (st.wrote === 1 ? 'a page' : st.wrote + ' pages'));
  if (st.sold) parts.push('sold ' + st.sold);
  if (st.read) parts.push('read at the library');
  if (st.rim) parts.push('went to the rim');
  if (st.things) parts.push('looked at new things');
  if (st.notes) parts.push('found ' + (st.notes === 1 ? 'a note' : st.notes + ' notes'));
  addDiary('summary', 'day ' + d + '. ' + (parts.length ? parts.join(', ') : 'not much happened') + '. mostly felt ' + moodWord() + '.');
  S.stats = newStats();
  hooks.onBedtime(d);
}

function finish(a) {
  switch (a.id) {
    case 'eat': S.coins -= 2; S.stats.ate++; log('ate bread at the bakery'); break;
    case 'flies': S.stats.flies++; log('caught flies at the pond'); break;
    case 'draw': S.stats.drew++; break;
    case 'write': S.stats.wrote++; break;
    case 'sell': {
      const u = unsold(), busy = S.events.some(e => e.id === 'busy');
      if (Math.random() < 0.45 + S.needs.joy * 0.003 + (busy ? 0.2 : 0)) {
        const dr = u[0], c = 3 + Math.floor(Math.random() * 4); dr.sold = true; S.coins += c; S.stats.sold++; feel('joy', 8);
        log('sold "' + dr.title + '" for ' + c + ' coins');
        addDiary('event', 'sold "' + dr.title + '" for ' + c + ' coins. someone will hang it somewhere i\'ll never see.');
      } else { feel('calm', -5); feel('joy', -3); log('nobody bought a drawing'); S.lastFail = 'nobody bought a drawing'; }
      break;
    }
    case 'read': S.stats.read++; break;
    case 'pond': log('sat by the pond'); break;
    case 'stargaze': log('watched the stars from the lookout'); break;
    case 'wander': log('wandered around the square'); break;
    case 'explore': log('explored near ' + nearPlace(S.pos.x, S.pos.z)); break;
    case 'tidy': log('tidied the cottage'); break;
    case 'rim': S.rimTests++; S.stats.rim++; log('tested the rim (test #' + S.rimTests + ')'); break;
    case 'shrine': break;
    case 'inspect': { const th = thingById(a.thing); if (th) { th.inspections++; S.stats.things++; if (th.inspections >= 3) th.liked = true; } break; }
    case 'sleep': log('woke up'); break;
    case 'nap': log('took a nap'); break;
  }
  hooks.onFinish(a);
}

/* ---------- weather and happenings ---------- */
function weightedPick(list) { const tot = list.reduce((s, x) => s + x[1], 0); let r = Math.random() * tot; for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[0][0]; }
function onHour(h, d) {
  if (S.t >= S.weather.until) {
    const prev = S.weather.kind, next = weightedPick(WEATHER[seasonOf(d)]);
    S.weather = { kind: next, until: S.t + (3 + Math.random() * 6) * 60 };
    if (next !== prev) { log('the weather turned ' + (next === 'clear' ? 'clear' : next === 'cloudy' ? 'cloudy' : next === 'wind' ? 'windy' : next === 'fog' ? 'foggy' : next === 'snow' ? 'snowy' : 'rainy')); bump(); }
  }
  if (h >= 7 && h < 20 && Math.random() < 0.06 && S.events.length < 3) {
    const ev = pick(EVENTS.filter(e => !S.events.some(x => x.id === e.id)));
    if (ev) {
      const item = { id: ev.id, text: ev.text(), day: d };
      S.events.push(item); log('happening: ' + item.text);
      if (ev.coin) { S.coins += 1; }
      remember('day ' + d + ': ' + item.text, 2); bump();
    }
  }
  hooks.onHour(h, d);
}
function newDay(d) {
  S.lastDay = d; S.dayLog[d] = S.dayLog[d] || [];
  const keys = Object.keys(S.dayLog).map(Number).sort((a, b) => a - b);
  while (keys.length > 6) delete S.dayLog[keys.shift()];
  // most happenings last a day; a broken fountain or the echo linger for two
  S.events = S.events.filter(e => ['fountain', 'echo'].includes(e.id) ? d - e.day < 2 : e.day >= d);
  if (d > 1 && (d - 1) % 7 === 0) { log('the season turned to ' + seasonOf(d)); addDiary('event', 'it feels like ' + seasonOf(d) + ' now. the air changed overnight.'); }
}

/* ---------- the main tick (called several times a second with real seconds) ---------- */
export function tick(dt, requestDecision) {
  const mins = dt * config.timeScale / 60;
  const before = S.t;
  S.t += mins;
  const d = dayOf(S.t); if (d !== S.lastDay) newDay(d);
  const h = Math.floor(hourOf(S.t)); if (h !== S.lastHour) { S.lastHour = h; onHour(h, d); }
  const a = S.act;
  const asleep = !!(a && a.phase === 'do' && (a.id === 'sleep' || a.id === 'nap'));
  decay(S.t - before, asleep);
  if (!a) { if (!S.deciding) requestDecision(); return; }
  if (a.phase === 'walk') {
    const dx = a.tx - S.pos.x, dz = a.tz - S.pos.z, dist = Math.hypot(dx, dz), stepLen = WALK_SPEED * dt;
    if (dist <= stepLen) { S.pos.x = a.tx; S.pos.z = a.tz; arrive(a); }
    else { S.pos.x += dx / dist * stepLen; S.pos.z += dz / dist * stepLen; S.face = Math.atan2(dx, dz); noticeThings(); }
  } else if (a.phase === 'do') {
    const g = ACTIONS[a.id].gain; for (const k in g) feel(k, g[k] * (S.t - before) / a.total);
    a.left -= S.t - before;
    if (a.left <= 0) { finish(a); S.act = null; bump(); }
  }
}
function noticeThings() {
  for (const th of S.things) {
    if (!th.noticed && Math.hypot(th.x - S.pos.x, th.z - S.pos.z) < 7) {
      th.noticed = true; feel('wonder', 4); log('noticed something new: ' + th.name);
      setThought(pick(['what is that? that wasn\'t there before.', 'something new by ' + nearPlace(th.x, th.z) + '.'])); bump();
    }
  }
}

/* ---------- visitor actions ---------- */
export function spotProblem(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Pick a spot on the island.';
  if (Math.hypot(x, z) > 19.5) return 'Too close to the edge. Try further in.';
  for (const k in PLACES) { const p = PLACES[k]; const r = k === 'pond' || k === 'lookout' ? 5.5 : k === 'square' ? 3.2 : 3.6; if (Math.hypot(p.bx - x, p.bz - z) < r) return 'That spot is taken by ' + p.name + '. Try another.'; }
  for (const t of S.things) if (Math.hypot(t.x - x, t.z - z) < 2.4) return 'Too close to the ' + plainName(t.name) + '.';
  return null;
}
export function addThing({ kind, name, desc, x, z }) {
  const th = { id: uid(), kind: KINDS[kind] ? kind : 'statue', name: str(name, 40), desc: str(desc, 240), x, z, day: dayOf(S.t), seen: false, noticed: false, inspections: 0 };
  S.things.push(th);
  log('a ' + plainName(th.name) + ' appeared near ' + nearPlace(x, z));
  if (S.act && S.act.phase === 'walk' && S.act.id !== 'sleep') S.act = null;
  bump(); return th;
}
export function builtinBook() {
  const known = new Set(S.knowledge.map(k => k.topic));
  return BOOKS.find(b => !known.has(b.topic)) || null;
}

/* ---------- public snapshot for the web page ---------- */
export function publicState(extra = {}) {
  return {
    t: S.t, day: dayOf(S.t), time: hhmm(S.t), season: seasonOf(dayOf(S.t)), rev: S.rev,
    needs: S.needs, coins: S.coins, mood: moodWord(), pos: S.pos, face: S.face,
    act: S.act ? { id: S.act.id, phase: S.act.phase, tx: S.act.tx, tz: S.act.tz } : null,
    doing: doingText(), thought: S.thought, weather: S.weather.kind, events: S.events.map(e => e.text),
    self: S.self, beliefs: S.beliefs, goals: S.goals, leanings: S.leanings, questions: S.questions,
    knowledge: S.knowledge.slice(-40), researchQueue: S.researchQueue.map(r => r.topic),
    diary: S.diary.slice(-150), drawings: S.drawings.slice(-60), pages: S.pages.slice(-30),
    notes: S.notes.slice(0, 40).map(n => ({ id: n.id, text: n.text, from: n.from, day: n.day, read: n.read, readDay: n.readDay, reaction: n.read && n.reaction ? n.reaction.reaction : '' })),
    things: S.things.map(t => ({ id: t.id, kind: t.kind, name: t.name, x: t.x, z: t.z, seen: t.seen, noticed: t.noticed, inspections: t.inspections })),
    rimTests: S.rimTests, memoryCount: S.memories.length,
    ...extra,
  };
}
