// Percy's world: the town, his needs, time, weather, happenings, and the mechanics of doing things.
// The "mind" (mind.js) decides what he does; this file makes it happen.
import { config } from './config.js';
import { clamp, pick, uid, str, plainName } from './util.js';
import * as Town from './town.js';
export { clamp, pick, uid, str, plainName };
export const { TYPES, BUILDABLE } = Town;

const WALK_SPEED = 2.4; // units per real second, so walking looks natural at any time scale

// What he can do, and which kind of place it happens at.
export const ACTIONS = {
  sleep: { at: 'home', label: 'sleeping', gain: { energy: 100, calm: 10 }, desc: 'go home to bed for the night' },
  nap: { at: 'home', label: 'napping', dur: 80, gain: { energy: 30 }, desc: 'a short nap at home' },
  draw: { at: 'home', label: 'drawing', dur: 90, gain: { joy: 12, energy: -6, wonder: -4 }, desc: 'draw something at his desk (say what in "subject")' },
  write: { at: 'home', label: 'writing a page', dur: 80, gain: { joy: 8, energy: -4, wonder: -3 }, desc: 'write a page to pin up for visitors: a guide, a list, a log, an observation (say what in "subject")' },
  tidy: { at: 'home', label: 'tidying the cottage', dur: 40, gain: { calm: 12 }, desc: 'tidy the cottage' },
  eat: { at: 'bakery', label: 'eating bread', dur: 30, gain: { fullness: 45, joy: 6 }, desc: 'buy and eat bread at the bakery (2 coins)' },
  read: { at: 'library', label: 'reading', dur: 90, gain: { wonder: 20, energy: -4 }, desc: 'read and research at the library (put the topic in "subject")' },
  sell: { at: 'market', label: 'tending the market stall', dur: 40, gain: {}, desc: 'take his drawings to the empty market stall, leave them out with prices, and collect any coins from the honesty tin' },
  pond: { at: 'green', label: 'sitting by the pond', dur: 60, gain: { calm: 22, joy: 4 }, desc: 'sit by the pond on the village green' },
  fish: { at: 'green', label: 'fishing in the pond', dur: 45, gain: { fullness: 20, calm: 4 }, desc: 'dive for fish in the pond (free food)' },
  stargaze: { at: 'lookout', label: 'watching the stars', dur: 90, gain: { wonder: 24, calm: 8 }, desc: 'watch the stars from the lookout hill (night only)' },
  shrine: { at: 'stone', label: 'at the Humming Stone', dur: 30, gain: { wonder: 8 }, desc: 'visit the Humming Stone and check for notes from visitors' },
  visit: { at: null, label: 'visiting', dur: 50, gain: { wonder: 4, joy: 2 }, desc: 'go to a particular place in town (give its id as "target") and spend time there' },
  explore: { at: null, label: 'exploring', dur: 35, gain: { wonder: 10, energy: -3 }, desc: 'explore: head for somewhere he has never been, or a far corner of town' },
  fog: { at: null, label: 'testing the fog', dur: 50, gain: { wonder: 14 }, desc: 'walk to the end of a road and test the fog at the edge of the world' },
  wander: { at: null, label: 'wandering', dur: 35, gain: { wonder: 5, joy: 2 }, desc: 'wander the streets nearby' },
  buy: { at: null, label: 'buying something', dur: 20, gain: { joy: 14 }, desc: 'buy something he has seen for sale (give the item id as "target"); only if he has the coins' },
  graffiti: { at: null, label: 'painting on a wall', dur: 40, gain: { joy: 10, wonder: -2 }, desc: 'paint graffiti on a wall somewhere in town (what to paint in "subject", a short tag of a few words in "title")' },
  inspect: { at: null, label: 'looking closely at something', dur: 45, gain: { wonder: 16, joy: 4 }, desc: 'go and look closely at an object visitors added to town (give its id as "target")' },
};
export const ACTION_IDS = Object.keys(ACTIONS);

export const KINDS = {
  statue: 'Statue', lighthouse: 'Lighthouse', telescope: 'Telescope', mushrooms: 'Mushroom ring', phonebox: 'Phone box',
  crate: 'Mystery crate', sign: 'Signpost', tree: 'Blossom tree', bench: 'Bench', train: 'Little train',
};

const BOOKS = [
  { topic: 'the moon', facts: ['the moon is about 384,000 km away. further than the fog, probably.', 'it always shows the same face to us.'] },
  { topic: 'penguins', facts: ['most penguins live in the southern hemisphere. i live in mossbrook. unclear where that is.', 'penguins can\'t fly, but they fly underwater instead.'] },
  { topic: 'bread', facts: ['bread rises because yeast makes tiny bubbles of gas.', 'people have baked bread for over ten thousand years.'] },
  { topic: 'fog', facts: ['fog is a cloud touching the ground.', 'it forms when air cools until the water in it condenses into tiny droplets.'] },
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
  { id: 'parcel', text: () => 'there is a small parcel by the cottage door, with no name on it. inside: ' + pick(['a packet of seeds', 'a blank notebook', 'a brass key that fits nothing', 'a ribbon the colour of the pond', 'a smooth grey pebble']) + '.' },
  { id: 'bird', text: () => 'a big bird flew low over the rooftops and disappeared into the fog.' },
  { id: 'hum', text: () => 'the Humming Stone is humming a different note today, lower than usual.' },
  { id: 'coin', text: () => 'there is a coin lying between the cobbles on the High Street.', coin: true },
  { id: 'busy', text: () => 'bunting has appeared over the market stall overnight. nobody put it up.' },
  { id: 'flicker', text: () => 'the street lamps keep flickering.' },
  { id: 'echo', text: () => 'from somewhere in the fog, every so often, there is a sound like an echo of a voice.' },
  { id: 'clock', text: () => 'the clock tower struck thirteen this morning.' },
  { id: 'train', text: () => 'a train whistle was heard from the station, but no train came.' },
  { id: 'letter', text: () => 'the post office has a letter in the window addressed to "whoever lives here".' },
];

export let S = null;
export let watchers = 0; // people outside, watching right now (Percy can't see them)
export const setWatchers = n => { watchers = n; };
export const fmtHour = h => (h % 12 || 12) + (h < 12 || h === 24 ? 'am' : 'pm');
export function setState(s) {
  S = s;
  // things visitors add live in S.things; the town layout needs to see them without saving them twice
  Object.defineProperty(S.town, 'things', { get: () => S.things, enumerable: false, configurable: true });
}

export function newWorld() {
  const town = Town.initialTown();
  const home = town.places.find(p => p.type === 'home');
  return {
    v: 2, created: Date.now(), t: 7 * 60, lastDay: 1, lastHour: 7, coins: 6, rev: 1, town,
    needs: { fullness: 72, energy: 85, wonder: 58, joy: 60, calm: 64 },
    pos: { x: home.door.x, z: home.door.z }, face: 0, act: null, recent: [], deciding: false, lastFail: '',
    thought: { text: 'morning. the street is quiet.', src: 'rules' }, recentThoughts: [],
    self: {
      description: 'A small penguin who lives in a cottage on Pond Lane in Mossbrook. He likes the pond on the green, cold mornings and fish. He cannot fly and has mostly made his peace with it. Nobody he knows has ever been past the fog where the roads end.',
      likes: ['the pond at dusk', 'cold mornings', 'fish'], fears: ['thunder', 'very hot days'], obsession: '',
    },
    traits: { curiosity: 0.65, creativity: 0.7 },
    beliefs: ['the town is the whole world', 'the stone hums louder at night'],
    goals: [{ text: 'draw something every day', action: 'draw' }],
    leanings: {}, questions: ['what is past the fog?'],
    knowledge: [], researchQueue: [], memories: [],
    diary: [], drawings: [], pages: [], notes: [], things: [], graffiti: [], items: [], inventory: [],
    dayLog: { 1: [] }, stats: newStats(), fogTests: 0,
    weather: { kind: 'clear', until: 12 * 60 }, events: [],
    lastSeenReal: Date.now(),
  };
}
// Fill in anything a newer version expects but an older save doesn't have yet, without touching what's there.
export function migrate(saved) {
  const fresh = newWorld();
  const fill = (target, defaults) => {
    for (const k in defaults) {
      if (!(k in target) || target[k] === undefined) target[k] = defaults[k];
      else if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) && typeof target[k] === 'object' && k !== 'town' && k !== 'dayLog' && k !== 'leanings') fill(target[k], defaults[k]);
    }
  };
  fill(saved, fresh);
  for (const p of saved.town.places) { p.visits = p.visits || 0; if (p.known === undefined) p.known = true; }
  for (const t of saved.things) { t.status = t.status || 'ready'; t.size = t.size || 3; }
  saved.v = Math.max(saved.v || 2, 2);
  return saved;
}
// The frog who lived in the cottage before Percy left a notebook behind.
export function leaveNotebook(old) {
  const entries = (old.diary || []).filter(e => e && e.text).slice(-80).map(e => ({ day: e.day, time: e.time, text: String(e.text).slice(0, 600) }));
  if (!entries.length) return;
  S.notebook = { author: 'Fennel', entries };
  addDiary('event', 'found an old notebook under a loose floorboard. the name inside says fennel. i think fennel was a frog. he lived here before me. he kept going to "the rim". i don\'t know where that is.');
  remember('found Fennel\'s notebook under the floorboards. Fennel was a frog who lived in my cottage before me.', 5);
  S.questions.unshift('who was fennel, and where did he go?');
  S.questions = S.questions.slice(0, 6);
}

const newStats = () => ({ ate: 0, fish: 0, drew: 0, painted: 0, saw: 0, wrote: 0, sold: 0, read: 0, fog: 0, notes: 0, things: 0, closed: 0, found: 0 });

/* ---------- time ---------- */
export const dayOf = t => Math.floor(t / 1440) + 1;
export const hourOf = t => (t % 1440) / 60;
export const hhmm = t => { const m = Math.floor(t % 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const seasonOf = d => SEASONS[Math.floor((d - 1) / 7) % 4];
export const isNight = h => h >= 21.5 || h < 6;
export function isOpen(place, h) {
  if (!place) return false;
  if (place.type === 'bakery' && S.events.some(e => e.id === 'bakery_shut')) return false;
  const o = TYPES[place.type].open; return !o || (h >= o[0] && h < o[1]);
}

/* ---------- places ---------- */
export const placeById = id => S.town.places.find(p => p.id === id);
export function placeOfType(type, from = S.pos) {
  let best = null, bd = Infinity;
  for (const p of S.town.places) if (p.type === type && p.known) { const d = Math.hypot(p.x - from.x, p.z - from.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
export function nearPlace(x, z) {
  let b = 'the middle of town', bd = Infinity;
  for (const p of S.town.places) { if (!p.known) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p.name; } }
  return b;
}
export function whereIs() {
  for (const p of S.town.places) if (p.known && Math.hypot(p.door.x - S.pos.x, p.door.z - S.pos.z) < 3) return 'at ' + p.name;
  const road = Town.roadNameAt(S.town, S.pos.x, S.pos.z);
  return road ? 'on ' + road : 'near ' + nearPlace(S.pos.x, S.pos.z);
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
export function moodWord() {
  const n = S.needs;
  if (n.fullness < 22) return 'hungry'; if (n.energy < 18) return 'sleepy'; if (n.calm < 32) return 'jittery';
  if (n.wonder < 25) return 'bored'; if (n.joy > 74) return 'happy'; if (n.wonder > 74) return 'curious'; if (n.joy < 32) return 'low';
  return 'content';
}
export function doingText() {
  const a = S.act;
  if (!a) return S.deciding ? 'stopping to think' : 'deciding what to do';
  if (a.doing && a.phase === 'do') return a.doing;
  const where = a.place ? placeById(a.place) : null;
  if (a.id === 'inspect') { const th = thingById(a.thing); const nm = th ? 'the ' + plainName(th.name) : 'something'; return a.phase === 'walk' ? 'going to look at ' + nm : 'looking closely at ' + nm; }
  if (a.phase === 'walk') {
    if (a.id === 'fog') return 'walking to where ' + (a.road || 'the road') + ' meets the fog';
    if (a.id === 'explore') return where && !where.known ? 'exploring towards the edge of town' : 'exploring';
    if (a.id === 'wander') return 'wandering';
    return 'heading to ' + (where ? where.name : 'somewhere') + (a.doing ? ' (' + a.doing + ')' : '');
  }
  if (a.id === 'fog') return 'pressing at the fog at the end of ' + (a.road || 'the road');
  return ACTIONS[a.id].label + (where ? ' at ' + where.name : '');
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
  if (!asleep && w === 'rain' && outdoors()) n.calm -= 1.5 / 60 * mins;
  if (!asleep && w === 'snow' && outdoors()) n.joy += 2 / 60 * mins; // a penguin likes snow
  for (const k in n) n[k] = clamp(n[k], 0, 100);
}
function outdoors() { const a = S.act; return !a || a.phase === 'walk' || !['sleep', 'nap', 'draw', 'write', 'read', 'tidy', 'eat', 'visit'].includes(a.id); }

/* ---------- what's possible right now ---------- */
export function available(id, h = hourOf(S.t)) {
  const A = ACTIONS[id], n = S.needs, night = isNight(h);
  if (A.at) { const p = placeOfType(A.at); if (!p) return false; if (A.at !== 'home' && !isOpen(p, h)) return false; }
  switch (id) {
    case 'sleep': return night || n.energy < 15;
    case 'nap': return !night && n.energy < 45;
    case 'eat': return S.coins >= 2;
    case 'fish': return !night;
    case 'sell': return unsold().some(d => !d.onStall) || (S.tin || 0) > 0 || S.drawings.some(d => d.sold && !d.noticedSold);
    case 'stargaze': return (h >= 20 || h < 4) && S.weather.kind !== 'fog';
    case 'inspect': return S.things.length > 0;
    case 'write': return false; // needs Claude; the mind offers it itself
    case 'buy': return S.items.some(it => it.seen && !it.sold && it.price <= S.coins);
    case 'graffiti': return S.coins >= 2;
    default: return true;
  }
}
function unknownPlaces() { return S.town.places.filter(p => !p.known); }
function bestThing() {
  let best = null, bs = -1e9;
  for (const th of S.things) { let s = th.seen ? (0.25 - th.inspections * 0.12 + (th.liked ? 0.3 : 0)) : (2.2 + S.traits.curiosity); s += Math.random() * 0.2; if (s > bs) { bs = s; best = th; } }
  return best ? { s: bs, thing: best.id } : null;
}
function ruleScore(id, h) {
  if (!available(id, h)) return -1e9;
  const n = S.needs, night = isNight(h), tr = S.traits, wet = ['rain', 'snow'].includes(S.weather.kind);
  let s;
  switch (id) {
    case 'sleep': s = night ? 3 + (100 - n.energy) * 0.02 : 2.5; if (h >= 6 && h < 9 && n.energy > 60) return -1e9; break;
    case 'nap': s = 0.8 + (45 - n.energy) * 0.05; break;
    case 'eat': s = (100 - n.fullness) * 0.035; break;
    case 'fish': s = (100 - n.fullness) * 0.025 + (S.coins < 2 ? 0.4 : 0); break;
    case 'draw': s = 0.7 + tr.creativity * 0.6 + (100 - n.joy) * 0.006 + (wet ? 0.3 : 0) - (n.energy < 25 ? 0.6 : 0) - S.stats.drew * 0.45; break;
    case 'sell': s = 0.3 + unsold().filter(d => !d.onStall).length * 0.25 + (S.coins < 4 ? 0.8 : 0) + ((S.tin || 0) > 0 ? 0.3 : 0); break;
    case 'read': s = (100 - n.wonder) * 0.02 + tr.curiosity * 0.5 + (S.researchQueue.length ? 1.2 : 0) + (wet ? 0.3 : 0); break;
    case 'pond': s = (100 - n.calm) * 0.025 + 0.3 - (wet ? 0.4 : 0); break;
    case 'stargaze': s = 0.6 + (100 - n.wonder) * 0.018; break;
    case 'shrine': s = 0.3 + S.notes.filter(x => !x.read).length * 1.6 + (n.wonder < 40 ? 0.45 : 0); break;
    case 'fog': s = n.wonder < 40 ? 0.5 + tr.curiosity * 0.8 + (40 - n.wonder) * 0.03 : 0.05; if (S.weather.kind === 'fog') s += 0.3; break;
    case 'explore': s = 0.3 + tr.curiosity * 0.4 + unknownPlaces().length * 0.9 - (wet ? 0.3 : 0); break;
    case 'visit': s = 0.4 + (n.wonder < 45 ? 0.3 : 0); break;
    case 'wander': s = 0.4 + (n.wonder < 35 ? 0.3 : 0) - (wet ? 0.3 : 0); break;
    case 'tidy': s = 0.25 + (n.calm < 45 ? 0.4 : 0); break;
    case 'buy': { const it = S.items.filter(i => i.seen && !i.sold && i.price <= S.coins).sort((a, b) => b.price - a.price)[0]; s = it ? 0.5 + (S.coins - it.price > 10 ? 0.6 : 0) : -1e9; break; }
    case 'graffiti': s = 0.15 + (n.joy < 45 ? 0.2 : 0) + tr.creativity * 0.3 - S.stats.painted * 0.6; break;
    case 'write': s = -1e9; break;
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
  eat: ['bread. now.', 'stomach is making the pond noise.'], fish: ['the pond has free lunch. with fins.'],
  draw: ['an idea. going home before it leaves.'], sell: ['wonder if the tin has anything in it.'],
  read: ['want to know something new.'], pond: ['need the pond for a bit.'], stargaze: ['clear night. up the hill.'],
  shrine: ['the stone is humming. can feel it from here.'], fog: ['going to the end of the road. again.'],
  wander: ['no plan. just walking.'], explore: ['haven\'t been down that way for a while.'], tidy: ['the cottage is a mess. so am i.'],
  visit: ['might pop in somewhere.'], buy: ['i have the coins. i\'m doing it.'], graffiti: ['that wall is too clean.'], inspect: ['something new over there.'],
};
export function ruleDecision() {
  const h = hourOf(S.t); let best = 'wander', bs = -1e9;
  for (const id of ACTION_IDS) { const s = ruleScore(id, h); if (s > bs) { bs = s; best = id; } }
  const dec = { action: best, thought: pick(RULE_THOUGHTS[best] || ['hm.']), src: 'rules' };
  if (best === 'inspect') dec.target = (bestThing() || {}).thing;
  if (best === 'buy') dec.target = (S.items.filter(i => i.seen && !i.sold && i.price <= S.coins)[0] || {}).id;
  if (best === 'visit') { const opts = S.town.places.filter(p => p.known && TYPES[p.type].acts.includes('visit') && isOpen(p, h)); const p = opts.sort((a, b) => a.visits - b.visits)[0]; dec.target = p && p.id; }
  return dec;
}

/* ---------- carrying out decisions ---------- */
function chooseTarget(a, dec) {
  const A = ACTIONS[a.id];
  if (A.at) { const p = placeOfType(A.at); a.place = p.id; return p.door; }
  if (a.id === 'visit') {
    let p = placeById(dec.target);
    if (!p || !p.known) p = S.town.places.filter(x => x.known && x.type !== 'home').sort((x, y) => x.visits - y.visits)[0];
    a.place = p.id; return p.door;
  }
  if (a.id === 'inspect') { const th = thingById(a.thing); if (th) { const n = Town.nearestRoad(S.town, th.x, th.z); const dx = n.x - th.x, dz = n.z - th.z, L = Math.hypot(dx, dz) || 1; return { x: th.x + dx / L * 1.8, z: th.z + dz / L * 1.8 }; } }
  if (a.id === 'explore') {
    const un = unknownPlaces();
    if (un.length) { const p = un.sort((x, y) => Math.hypot(x.x - S.pos.x, x.z - S.pos.z) - Math.hypot(y.x - S.pos.x, y.z - S.pos.z))[0]; a.place = p.id; return p.door; }
    const e = pick(S.town.edges.filter(e => !e.path)); const A2 = S.town.nodes[e.a], B2 = S.town.nodes[e.b], t = Math.random();
    return { x: A2.x + (B2.x - A2.x) * t, z: A2.z + (B2.z - A2.z) * t };
  }
  if (a.id === 'buy') {
    let it = S.items.find(i => i.id === dec.target && !i.sold);
    if (!it) it = S.items.find(i => i.seen && !i.sold && i.price <= S.coins);
    const shop = it && placeById(it.shop);
    if (shop) { a.item = it.id; a.place = shop.id; return shop.door; }
  }
  if (a.id === 'graffiti') {
    const walls = [];
    for (const p of S.town.places) {
      if (!p.known || p.h <= 0 || p.type === 'home' || p.type === 'market') continue;
      for (const side of [-1, 1]) {
        const rx = Math.cos(p.rot) * side, rz = -Math.sin(p.rot) * side; // the building's side wall direction
        const wx = p.x + rx * (p.w / 2 + 0.03), wz = p.z + rz * (p.w / 2 + 0.03);
        if (S.graffiti.some(g => Math.hypot(g.x - wx, g.z - wz) < 2.5)) continue;
        walls.push({ p, wx, wz, nx: rx, nz: rz, d: Math.hypot(wx - S.pos.x, wz - S.pos.z) });
      }
    }
    walls.sort((a, b) => a.d - b.d);
    const w = pick(walls.slice(0, 4));
    if (w) { a.wall = { x: w.wx, z: w.wz, nx: w.nx, nz: w.nz, place: w.p.id, where: 'on the side of ' + w.p.name }; a.place = null; return { x: w.wx + w.nx * 1.4, z: w.wz + w.nz * 1.4 }; }
  }
  if (a.id === 'fog') {
    const ends = Town.endNodes(S.town); const id = pick(ends); const n = S.town.nodes[id];
    const e = S.town.edges.find(x => x.a === id || x.b === id); a.road = e ? e.name : 'the road';
    const L = Math.hypot(n.x, n.z) || 1; return { x: n.x + n.x / L * 2, z: n.z + n.z / L * 2 };
  }
  // wander: somewhere along a nearby road
  const near = S.town.edges.filter(e => !e.path).map(e => ({ e, d: Town.segInfo(S.pos.x, S.pos.z, S.town.nodes[e.a].x, S.town.nodes[e.a].z, S.town.nodes[e.b].x, S.town.nodes[e.b].z).d })).sort((x, y) => x.d - y.d).slice(0, 4);
  const e = pick(near).e, t = Math.random(), A3 = S.town.nodes[e.a], B3 = S.town.nodes[e.b];
  return { x: A3.x + (B3.x - A3.x) * t, z: A3.z + (B3.z - A3.z) * t };
}
export function startAct(dec) {
  let id = ACTIONS[dec.action] ? dec.action : 'wander';
  if (id === 'inspect' && !thingById(dec.target)) { const b = bestThing(); if (b) dec.target = b.thing; else id = 'wander'; }
  if (ACTIONS[id].at && !placeOfType(ACTIONS[id].at)) id = 'wander';
  const a = { id, phase: 'walk', thing: id === 'inspect' ? dec.target : null, doing: str(dec.doing, 80), subject: str(dec.subject, 80), title: str(dec.title, 50), src: dec.src || 'rules' };
  const tg = chooseTarget(a, dec);
  a.tx = tg.x; a.tz = tg.z; a.path = Town.route(S.town, S.pos, tg); a.wp = 0;
  S.act = a; S.recent.push(id); if (S.recent.length > 10) S.recent.shift();
  if (dec.thought) setThought(dec.thought, dec.src === 'claude' ? 'claude' : 'rules');
  S.lastFail = '';
  bump();
}
function durFor(id, h) {
  if (id === 'sleep') { if (h >= 20) return Math.round((24 - h + 7) * 60); if (h < 7) return Math.max(60, Math.round((7 - h) * 60)); return 240; }
  return ACTIONS[id].dur;
}
function fail(why, thought) {
  S.lastFail = why; log(why); feel('calm', -5); feel('joy', -3); setThought(thought || why);
  S.act = null; bump();
}

let hooks = { onArrive: () => {}, onFinish: () => {}, onBedtime: () => {}, onDiscover: () => {}, onGrow: () => {}, onGraffitiSeen: () => {}, onItemSeen: () => {} };
export const setHooks = h => { hooks = { ...hooks, ...h }; };

function arrive(a) {
  const h = hourOf(S.t), p = a.place ? placeById(a.place) : null;
  if (p && !p.known) discover(p);
  if (p && TYPES[p.type].open && !isOpen(p, h)) {
    S.stats.closed++;
    if (S.stats.closed === 1) addDiary('event', 'walked all the way to ' + p.name + '. shut. i should read the sign on the door properly.');
    return fail(p.name + ' was closed', p.name + ' is shut. walked all that way.');
  }
  if (a.id === 'eat' && S.coins < 2) return fail('not enough coins for bread', 'not enough coins. fish, then.');
  if (a.id === 'sell' && !unsold().length) return fail('had nothing to sell', 'nothing to sell. need to draw more.');
  if (a.id === 'inspect' && !thingById(a.thing)) return fail('the thing he went to see was gone', 'it\'s gone. was it ever there?');
  if (a.id === 'buy') { const it = S.items.find(i => i.id === a.item); if (!it || it.sold) return fail('what he came to buy had gone', 'it\'s gone from the window.'); if (S.coins < it.price) return fail('not enough coins for ' + it.name, 'counted my coins twice. still not enough.'); }
  if (a.id === 'graffiti' && S.coins < 2) return fail('no money for paint', 'can\'t afford paint.');
  a.phase = 'do'; a.total = a.left = durFor(a.id, h);
  if (a.id === 'inspect') { const th = thingById(a.thing); S.face = Math.atan2(th.x - S.pos.x, th.z - S.pos.z); }
  else if (p && p.h > 0) S.face = Math.atan2(p.x - S.pos.x, p.z - S.pos.z);
  if (p) {
    p.visits++;
    if (a.id === 'visit') {
      a.extra = { ...(TYPES[p.type].feel || {}) };
      if (p.type === 'cafe') { if (S.coins >= 2) { S.coins -= 2; a.extra.joy = (a.extra.joy || 0) + 6; a.extra.fullness = 15; a.doing = a.doing || 'tea and a slice of cake'; } else a.doing = a.doing || 'smelling the cakes, not buying any'; }
    }
    seeItems(p);
  }
  if (a.id === 'fog') S.face = Math.atan2(a.tx, a.tz);
  if (a.id === 'graffiti' && a.wall) S.face = Math.atan2(-a.wall.nx, -a.wall.nz);
  if (a.id === 'sleep' && (h >= 20 || h < 5)) bedtime(h);
  hooks.onArrive(a, p);
  bump();
}
function discover(p) {
  p.known = true; p.foundDay = dayOf(S.t); S.stats.found++; feel('wonder', 12);
  log('discovered ' + p.name); setThought(pick(['that wasn\'t here before.', 'a new place. ' + p.name + '.', 'the fog left something behind.']));
  remember('day ' + dayOf(S.t) + ': discovered ' + p.name + ', a ' + TYPES[p.type].label, 3);
  hooks.onDiscover(p); S.town.ver++; bump();
}
function bedtime(h) {
  const d = h < 12 ? dayOf(S.t) - 1 : dayOf(S.t); if (d < 1) return;
  const st = S.stats, parts = [];
  if (st.ate) parts.push('ate bread ' + (st.ate === 1 ? 'once' : st.ate + ' times'));
  if (st.fish) parts.push('caught fish');
  if (st.drew) parts.push('drew ' + (st.drew === 1 ? 'one picture' : st.drew + ' pictures'));
  if (st.wrote) parts.push('wrote ' + (st.wrote === 1 ? 'a page' : st.wrote + ' pages'));
  if (st.sold) parts.push('sold ' + st.sold);
  if (st.read) parts.push('read at the library');
  if (st.fog) parts.push('tested the fog');
  if (st.found) parts.push('found ' + (st.found === 1 ? 'a new place' : st.found + ' new places'));
  if (st.things) parts.push('looked at new things');
  if (st.notes) parts.push('found ' + (st.notes === 1 ? 'a note' : st.notes + ' notes'));
  addDiary('summary', 'day ' + d + '. ' + (parts.length ? parts.join(', ') : 'not much happened') + '. mostly felt ' + moodWord() + '.');
  S.stats = newStats();
  hooks.onBedtime(d);
}
function finish(a) {
  switch (a.id) {
    case 'eat': S.coins -= 2; S.stats.ate++; log('ate bread at the bakery'); break;
    case 'fish': S.stats.fish++; log('caught fish in the pond'); break;
    case 'draw': S.stats.drew++; if (S.coins >= 1) S.coins -= 1; else a.scrap = true; break;
    case 'write': S.stats.wrote++; break;
    case 'sell': {
      // Nobody else lives here. He leaves drawings out; later some are gone and there are coins in the tin.
      const gone = S.drawings.filter(d => d.sold && !d.noticedSold);
      const coins = S.tin || 0; S.tin = 0; S.coins += coins;
      for (const d of gone) d.noticedSold = true;
      const placed = unsold().filter(d => !d.onStall).slice(0, Math.max(0, 6 - unsold().filter(d => d.onStall).length));
      for (const d of placed) { d.onStall = true; d.price = d.price || 2 + Math.floor(Math.random() * 4); }
      if (gone.length) {
        S.stats.sold += gone.length; feel('joy', 6); feel('wonder', 6);
        const names = gone.map(d => '"' + d.title + '"').join(', ');
        log('found ' + names + ' gone from the stall and ' + coins + ' coins in the tin');
        addDiary('stall', (gone.length === 1 ? names + ' was gone' : names + ' were gone') + ' from the stall. ' + coins + ' coins in the tin. ' + pick(['i never see who takes them.', 'there\'s nobody here. there\'s never anybody here.', 'i waited a while in case. nobody.', 'the tin was warm, like someone had just touched it.']));
        remember('day ' + dayOf(S.t) + ': drawings vanished from the stall and coins appeared in the tin; nobody seen', 3);
      } else if (!placed.length) { log('the stall was just as he left it'); S.lastFail = 'nothing had gone from the stall'; feel('joy', -2); }
      if (placed.length) log('left ' + placed.length + ' drawing' + (placed.length > 1 ? 's' : '') + ' out on the stall');
      break;
    }
    case 'read': S.stats.read++; break;
    case 'pond': log('sat by the pond'); break;
    case 'stargaze': log('watched the stars from the lookout hill'); break;
    case 'wander': log('wandered ' + whereIs()); break;
    case 'explore': log('explored ' + whereIs()); break;
    case 'visit': { const p = placeById(a.place); if (p) log('spent time at ' + p.name); break; }
    case 'tidy': log('tidied the cottage'); break;
    case 'buy': { const it = S.items.find(i => i.id === a.item); if (it && !it.sold && S.coins >= it.price) { S.coins -= it.price; it.sold = true; it.boughtDay = dayOf(S.t); S.inventory.push({ id: it.id, name: it.name, desc: it.desc, price: it.price, day: dayOf(S.t), img: it.img || '', model: it.model || null }); log('bought ' + it.name + ' for ' + it.price + ' coins'); remember('day ' + dayOf(S.t) + ': bought ' + it.name + ' for ' + it.price + ' coins', 4); a.bought = it; } break; }
    case 'graffiti': if (a.wall) { S.coins = Math.max(0, S.coins - 2); S.stats.painted++; const g = { id: uid(), by: 'percy', x: a.wall.x, y: 1.75, z: a.wall.z, nx: a.wall.nx, nz: a.wall.nz, w: 2.2, h: 2.3, place: a.wall.place, where: a.wall.where, tag: a.title || '', subject: a.subject || '', seed: Math.floor(Math.random() * 1e9), day: dayOf(S.t), seen: true }; S.graffiti.push(g); a.made = g; log('painted graffiti ' + a.wall.where); } break;
    case 'fog': S.fogTests++; S.stats.fog++; log('tested the fog at the end of ' + (a.road || 'a road') + ' (test #' + S.fogTests + ')'); break;
    case 'inspect': { const th = thingById(a.thing); if (th) { th.inspections++; S.stats.things++; if (th.inspections >= 3) th.liked = true; } break; }
    case 'sleep': log('woke up'); break;
    case 'nap': log('took a nap'); break;
  }
  hooks.onFinish(a);
}

/* ---------- weather, happenings, growth ---------- */
function weightedPick(list) { const tot = list.reduce((s, x) => s + x[1], 0); let r = Math.random() * tot; for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[0][0]; }
function onHour(h, d) {
  if (S.t >= S.weather.until) {
    const prev = S.weather.kind, next = weightedPick(WEATHER[seasonOf(d)]);
    S.weather = { kind: next, until: S.t + (3 + Math.random() * 6) * 60 };
    if (next !== prev) { log('the weather turned ' + ({ clear: 'clear', cloudy: 'cloudy', wind: 'windy', fog: 'foggy', snow: 'snowy', rain: 'rainy' })[next]); bump(); }
  }
  if (h >= 7 && h < 20 && Math.random() < 0.06 && S.events.length < 3) {
    const ev = pick(EVENTS.filter(e => !S.events.some(x => x.id === e.id)));
    if (ev) {
      const item = { id: ev.id, text: ev.text(), day: d };
      S.events.push(item); log('happening: ' + item.text);
      if (ev.coin) S.coins += 1;
      remember('day ' + d + ': ' + item.text, 2); bump();
    }
  }
  if (h === 5 && config.growEveryDays > 0 && d > 1 && (d - 1) % config.growEveryDays === 0) growTown('time');
}
export function growTown(by = 'time') {
  const g = Town.grow(S.town, { day: dayOf(S.t) });
  const text = 'the fog has pulled back' + (g.road ? ' along ' + g.road : '') + '. there is more town out there than there was.';
  S.events.push({ id: 'grow-' + uid(), text, day: dayOf(S.t) }); log(text);
  remember('day ' + dayOf(S.t) + ': ' + text, 3); hooks.onGrow(g, by); bump();
  return g;
}
export function addBuilding({ kind, name, desc, x, z }) {
  if (!BUILDABLE.includes(kind)) return { error: 'Pick one of the building types.' };
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { error: 'Pick a spot.' };
  if (Math.hypot(x, z) > S.town.R + 12) return { error: 'That\'s too deep in the fog. Try nearer the edge of town.' };
  const T = TYPES[kind]; const rot = Town.facingRot(S.town, x, z);
  if (!Town.fits(S.town, x, z, T.w, T.d, rot)) return { error: 'Not enough room there. Try a bit further from the road and other buildings.' };
  const p = Town.addPlace(S.town, { type: kind, name: str(name, 50), desc, x, z, rot, known: false, builtBy: 'keeper', day: dayOf(S.t) });
  log('something new was built near ' + nearPlace(x, z)); bump();
  return { place: p };
}
function newDay(d) {
  S.lastDay = d; S.dayLog[d] = S.dayLog[d] || [];
  const keys = Object.keys(S.dayLog).map(Number).sort((a, b) => a - b);
  while (keys.length > 6) delete S.dayLog[keys.shift()];
  S.events = S.events.filter(e => e.id === 'echo' ? d - e.day < 2 : e.id.startsWith('grow-') ? d - e.day < 2 : e.day >= d);
  if (d > 1 && (d - 1) % 7 === 0) { log('the season turned to ' + seasonOf(d)); addDiary('event', 'it feels like ' + seasonOf(d) + ' now. the air changed overnight.'); }
}

/* ---------- the main tick (called several times a second with real seconds) ---------- */
export function tick(dt, requestDecision) {
  const mins = dt * config.timeScale / 60, before = S.t;
  S.t += mins;
  const d = dayOf(S.t); if (d !== S.lastDay) newDay(d);
  const h = Math.floor(hourOf(S.t)); if (h !== S.lastHour) { S.lastHour = h; onHour(h, d); }
  const a = S.act;
  const asleep = !!(a && a.phase === 'do' && (a.id === 'sleep' || a.id === 'nap'));
  decay(S.t - before, asleep);
  if (!a) { if (!S.deciding) requestDecision(); return; }
  if (a.phase === 'walk') {
    let stepLen = WALK_SPEED * dt;
    while (stepLen > 0 && a.wp < a.path.length) {
      const wpt = a.path[a.wp], dx = wpt.x - S.pos.x, dz = wpt.z - S.pos.z, dist = Math.hypot(dx, dz);
      if (dist <= stepLen) { S.pos.x = wpt.x; S.pos.z = wpt.z; stepLen -= dist; a.wp++; }
      else { S.pos.x += dx / dist * stepLen; S.pos.z += dz / dist * stepLen; S.face = Math.atan2(dx, dz); stepLen = 0; }
    }
    noticeThings();
    if (a.wp >= a.path.length) arrive(a);
  } else if (a.phase === 'do') {
    const g = { ...ACTIONS[a.id].gain, ...(a.extra || {}) };
    for (const k in g) feel(k, g[k] * (S.t - before) / a.total);
    a.left -= S.t - before;
    if (a.left <= 0) { finish(a); S.act = null; bump(); }
  }
}
function noticeThings() {
  for (const th of S.things) {
    if (!th.noticed && Math.hypot(th.x - S.pos.x, th.z - S.pos.z) < 8) {
      th.noticed = true; feel('wonder', 4); log('noticed something new: ' + th.name);
      setThought(pick(['what is that? that wasn\'t there before.', 'something new by ' + nearPlace(th.x, th.z) + '.'])); bump();
    }
  }
  for (const p of S.town.places) if (!p.known && Math.hypot(p.door.x - S.pos.x, p.door.z - S.pos.z) < 9) discover(p);
  for (const p of S.town.places) if (p.known && Math.hypot(p.door.x - S.pos.x, p.door.z - S.pos.z) < 5) seeItems(p, true);
  for (const g of S.graffiti) if (!g.seen && Math.hypot(g.x - S.pos.x, g.z - S.pos.z) < 8) { g.seen = true; S.stats.saw++; feel('wonder', 6); log('noticed new graffiti ' + (g.where || 'on a wall')); setThought(pick(['someone painted on that wall.', 'that wasn\'t on the wall yesterday.'])); hooks.onGraffitiSeen(g); bump(); }
}

function seeItems(p, window = false) {
  for (const it of S.items) if (it.shop === p.id && !it.seen && !it.sold) {
    it.seen = true; it.seenDay = dayOf(S.t); feel('wonder', 4);
    log((window ? 'saw ' : 'found ') + it.name + ' for sale at ' + p.name + ' (' + it.price + ' coins)');
    remember('saw ' + it.name + ' for sale at ' + p.name + ' for ' + it.price + ' coins', 3);
    hooks.onItemSeen(it, p); bump();
  }
}
export function stockItem({ shop, name, price, desc }) {
  const p = placeById(shop);
  if (!p || !['shop', 'bakery', 'cafe', 'market', 'post', 'workshop', 'museum'].includes(p.type)) return { error: 'Pick a shop to put it in.' };
  const it = { id: uid(), shop: p.id, name: str(name, 60), desc: str(desc, 240), price: clamp(Math.round(Number(price) || 10), 1, 999), day: dayOf(S.t), seen: false, sold: false, status: 'building', model: null };
  if (!it.name) return { error: 'Give it a name.' };
  S.items.push(it); log('something new appeared in the window of ' + p.name); bump();
  return { item: it };
}

// A real person (a visitor to his page or website) buys a drawing from the stall. Percy only ever finds the coins.
export function buyDrawing(id, { coins, print = false } = {}) {
  const dr = S.drawings.find(d => d.id === id);
  if (!dr) return { error: 'That drawing isn\'t here any more.' };
  if (print) { const c = Math.max(1, Math.round(Number(coins) || 10)); S.tin = (S.tin || 0) + c; dr.prints = (dr.prints || 0) + 1; log('a print of "' + dr.title + '" was sold somewhere'); bump(); return { ok: true }; }
  if (!dr.onStall || dr.sold) return { error: dr.sold ? 'Someone has already taken that one.' : 'Percy hasn\'t put that one out on his stall yet.' };
  dr.sold = true; dr.soldDay = dayOf(S.t); S.tin = (S.tin || 0) + (dr.price || 3);
  bump(); return { ok: true, price: dr.price || 3 };
}

/* ---------- visitor objects ---------- */
export function spotProblem(x, z, size = 1.6) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Pick a spot in town.';
  if (Math.hypot(x, z) > S.town.R - 3) return 'That\'s in the fog. Try somewhere in town.';
  if (Town.nearestRoad(S.town, x, z).d < 2.4) return 'That\'s on the road. Try beside it.';
  if (!Town.fits(S.town, x, z, size, size, 0)) return 'There\'s something already there, or it\'s too close to the road. Try another spot.';
  return null;
}
export function addThing({ name, desc, x, z, size = 3 }) {
  const th = { id: uid(), kind: 'made', name: str(name, 60), desc: str(desc, 240), x, z, size: clamp(Number(size) || 3, 1, 8), rot: Math.atan2(-x, -z), day: dayOf(S.t), seen: false, noticed: false, inspections: 0, status: 'building', model: null };
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
export function publicTown() {
  const t = S.town;
  return { ver: t.ver, R: t.R, nodes: t.nodes, edges: t.edges.map(e => ({ a: e.a, b: e.b, name: e.name, path: !!e.path })),
    places: t.places.map(p => ({ id: p.id, type: p.type, name: p.name, x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, rot: p.rot, door: p.door, known: p.known, seed: p.seed, builtBy: p.builtBy })) };
}
export function publicState(extra = {}) {
  return {
    t: S.t, day: dayOf(S.t), time: hhmm(S.t), season: seasonOf(dayOf(S.t)), rev: S.rev,
    needs: S.needs, coins: S.coins, mood: moodWord(), pos: S.pos, face: S.face,
    act: S.act ? { id: S.act.id, phase: S.act.phase } : null,
    doing: doingText(), thought: S.thought, weather: S.weather.kind, events: S.events.map(e => e.text),
    self: S.self, beliefs: S.beliefs, goals: S.goals, leanings: S.leanings, questions: S.questions,
    knowledge: S.knowledge.slice(-40), researchQueue: S.researchQueue.map(r => r.topic),
    diary: S.diary.slice(-150), drawings: S.drawings.slice(-60), pages: S.pages.slice(-30),
    notes: S.notes.slice(0, 40).map(n => ({ id: n.id, text: n.text, from: n.from, day: n.day, read: n.read, readDay: n.readDay, reaction: n.read && n.reaction ? n.reaction.reaction : '' })),
    things: S.things.map(t => ({ id: t.id, name: t.name, x: t.x, z: t.z, rot: t.rot || 0, size: t.size || 3, status: t.status || 'ready', model: t.model || null, seen: t.seen, noticed: t.noticed, inspections: t.inspections })),
    graffiti: S.graffiti.map(g => ({ id: g.id, by: g.by, x: g.x, y: g.y, z: g.z, nx: g.nx, nz: g.nz, w: g.w, h: g.h, img: g.img || ('/media/graffiti/' + g.id + '.svg'), where: g.where, day: g.day, seen: g.seen })),
    notebook: S.notebook || null, inventory: S.inventory || [],
    items: S.items.map(i => ({ id: i.id, shop: i.shop, name: i.name, desc: i.desc, price: i.price, seen: i.seen, sold: i.sold, img: i.img || '', model: i.model || null, status: i.status || 'ready' })),
    town: publicTown(), fogTests: S.fogTests, memoryCount: S.memories.length,
    ...extra,
  };
}
