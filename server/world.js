// Mossbrook's objective truth: time, weather, the town, Percy's body, objects, money, post.
// It does not decide anything for Percy and has no opinions about him. It carries out what he chooses
// and reports what actually happened. What he perceives and remembers lives in perception.js and memory.js.
import { config } from './config.js';
import { clamp, pick, uid, str, plain, plainName } from './util.js';
import * as Town from './town.js';
import { emptyMind } from './memory.js';
export { clamp, pick, uid, str, plain, plainName };
export const { TYPES, BUILDABLE } = Town;

const WALK_SPEED = 2.4; // units per real second, so walking looks natural at any time scale
export const SCHEMA = 3;

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const WEATHER = {
  spring: [['clear', 4], ['cloudy', 3], ['rain', 3], ['fog', 1], ['wind', 1]],
  summer: [['clear', 6], ['cloudy', 2], ['rain', 1], ['wind', 1]],
  autumn: [['cloudy', 3], ['rain', 3], ['fog', 3], ['wind', 2], ['clear', 2]],
  winter: [['cloudy', 3], ['snow', 3], ['fog', 2], ['clear', 2], ['wind', 1]],
};
// Small things that happen in the world. They are only experienced if Percy is where they can be seen or heard.
const AMBIENT = [
  { id: 'bird', where: 'outdoors', text: 'a large bird flies low over the rooftops and into the fog' },
  { id: 'lamps', where: 'outdoors', night: true, text: 'the street lamps flicker for a few seconds' },
  { id: 'bell', where: 'anywhere', text: 'a single bell note comes from the direction of the clock tower, off the hour' },
  { id: 'wind', where: 'outdoors', text: 'a gust rattles shutters along the street' },
];

export let S = null;
export function setState(s) {
  S = s;
  // things the keeper adds live in S.things; the town layout needs to see them without saving them twice
  Object.defineProperty(S.town, 'things', { get: () => S.things, enumerable: false, configurable: true });
}

/* ---------- a brand-new instance: an explicit blank start ---------- */
export function newWorld() {
  const town = Town.initialTown();
  for (const p of town.places) p.known = p.type === 'home'; // he has seen only his cottage
  nameTheVillage(town);
  const home = town.places.find(p => p.type === 'home');
  const post = town.places.find(p => p.type === 'post'), cafe = town.places.find(p => p.type === 'cafe');
  const items = [];
  if (post) items.push({ id: uid(), shop: post.id, name: 'can of spray paint', look: 'a metal can with a nozzle on top and a red band around it', desc: 'spray paint', price: 2, day: 1, seen: false, sold: false, status: 'ready', restock: true });
  if (cafe) items.push({ id: uid(), shop: cafe.id, name: 'slice of cake', look: 'a wedge of something soft and golden under a glass dome', desc: 'eaten at the café', price: 2, day: 1, seen: false, sold: false, status: 'ready', restock: true, food: 30 });
  return {
    v: SCHEMA, created: Date.now(), t: config.startTime, lastDay: 1, lastHour: Math.floor(config.startTime / 60), rev: 1, town,
    body: { fullness: 72, energy: 88 }, pantry: 4, coins: 6, tin: 0,
    pos: { x: home.door.x, z: home.door.z }, face: 0, act: null, inside: home.id,
    feeling: null, thought: { text: '', src: 'none' }, deciding: false,
    mind: emptyMind(), journal: [], life: [],
    requests: [], projects: [], researchLog: [], ideas: [],
    drawings: [], pages: [], notes: [], percyNotes: [], things: [], graffiti: [], items, inventory: [],
    commissions: [], shop: [], post: [], payments: [], letters: [], earned: { work: 0, real: 0, stall: 0 },
    worldLog: { 1: [] }, events: [], vanished: [], weather: { kind: 'clear', until: 12 * 60 },
    settings: {}, permissions: {}, lastSeenReal: Date.now(),
    // explicit initial conditions, tagged as such in his memory (see agent.initialConditions)
    initial: {
      cottage: 'a small cottage with a bed, a desk with paper, pencils and an old computer, a cupboard with a few tins of sardines, and a window onto a lane',
      name: 'Percy',
    },
  };
}
// Fill in anything a newer v3 build expects without touching what's there.
// the green carries the village's name, so anyone walking past can learn where they are
function nameTheVillage(town) { const g = town && town.places.find(p => p.type === 'green'); if (g && !g.signText) g.signText = 'Welcome to Mossbrook'; }
// town minutes per real minute: the keeper's setting on the page, or TIME_SCALE
export function timeScale() {
  const v = S && S.settings && S.settings.timeScale, base = Number.isFinite(v) && v > 0 ? v : config.timeScale;
  // asleep, nothing is decided (so nothing is spent): the keeper can let the night pass quickly
  const asleep = S && S.act && S.act.phase === 'do' && (S.act.type === 'sleep' || S.act.type === 'nap');
  return asleep && (S.act.fast || S.settings.fastSleep === true) ? Math.max(base, 60) : base;
}
export function migrate(saved) {
  const fresh = newWorld();
  for (const k in fresh) if (!(k in saved) || saved[k] === undefined) saved[k] = fresh[k];
  for (const k in fresh.mind) if (!(k in saved.mind)) saved.mind[k] = fresh.mind[k];
  for (const k in fresh.earned) if (!(k in saved.earned)) saved.earned[k] = fresh.earned[k];
  nameTheVillage(saved.town);
  return saved;
}

/* ---------- time ---------- */
export const dayOf = t => Math.floor(t / 1440) + 1;
export const hourOf = t => (t % 1440) / 60;
export const hhmm = t => { const m = Math.floor(t % 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const seasonOf = d => SEASONS[Math.floor((d - 1) / 7) % 4];
export const isNight = h => h >= 21.5 || h < 6;
export const isDark = h => h >= 20.5 || h < 6.5;
export const fmtHour = h => (h % 12 || 12) + (h < 12 || h === 24 ? 'am' : 'pm');
export const clock = () => ({ t: S.t, day: dayOf(S.t), time: hhmm(S.t) });
export function isOpen(place, h = hourOf(S.t)) {
  if (!place) return false;
  const o = TYPES[place.type].open; return !o || (h >= o[0] && h < o[1]);
}

/* ---------- places and objects ---------- */
export const placeById = id => S.town.places.find(p => p.id === id);
export const thingById = id => S.things.find(t => t.id === id);
export const home = () => S.town.places.find(p => p.type === 'home');
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function placeAt(pos = S.pos, r = 3.2) { return S.town.places.find(p => dist(p.door, pos) < r) || null; }
export const roadAt = (x = S.pos.x, z = S.pos.z) => Town.roadNameAt(S.town, x, z);

/* ---------- records ---------- */
export function bump() { S.rev++; }
// the objective world log (keeper-visible): what actually happened, plainly
export function wlog(text) {
  const d = dayOf(S.t); (S.worldLog[d] = S.worldLog[d] || []).push(hhmm(S.t) + ' ' + str(text, 300));
  if (S.worldLog[d].length > 300) S.worldLog[d].shift();
}
// the public life record: a verified fact, optionally with Percy's own words about it
export function life(kind, fact, words = '', extra = {}) {
  const e = { id: uid(), day: dayOf(S.t), time: hhmm(S.t), kind, fact: str(fact, 600), words: str(words, 1200), ...extra };
  S.life.push(e); if (S.life.length > 600) S.life.splice(0, S.life.length - 600);
  bump(); return e;
}

/* ---------- the body: needs are constraints, not personality ---------- */
function bodyTick(mins) {
  const b = S.body, a = S.act;
  const resting = a && a.phase === 'do' && ['sleep', 'nap', 'rest'].includes(a.type);
  const asleep = a && a.phase === 'do' && (a.type === 'sleep' || a.type === 'nap');
  b.fullness -= (asleep ? 1.4 : 3.6) / 60 * mins;
  if (asleep) b.energy += (a.type === 'sleep' ? 13 : 9) / 60 * mins;
  // a body clock: staying awake late costs more, and resting at night doesn't refresh the way sleep does
  const h = hourOf(S.t), late = h >= 23 || h < 5 ? 3 : h >= 21 || h < 6 ? 1.6 : 1;
  if (resting) b.energy += (late > 1 ? 1.5 : 4) / 60 * mins;
  else b.energy -= (a && a.phase === 'walk' ? 4 : 3) / 60 * mins * (b.fullness <= 0 ? 1.6 : 1) * late;
  b.fullness = clamp(b.fullness, 0, 100); b.energy = clamp(b.energy, 0, 100);
}
// a plain description of how his body is, for perception (no numbers)
export function bodySense() {
  const b = S.body;
  const stomach = b.fullness < 8 ? 'empty and aching' : b.fullness < 22 ? 'very hungry' : b.fullness < 40 ? 'hungry' : b.fullness < 75 ? 'fine' : 'full';
  const energy = b.energy < 8 ? 'barely able to keep going' : b.energy < 22 ? 'exhausted' : b.energy < 40 ? 'tired' : b.energy < 75 ? 'fine' : 'rested';
  const h = hourOf(S.t), a = S.act, awake = !(a && a.phase === 'do' && (a.type === 'sleep' || a.type === 'nap'));
  const drowsy = awake && (h >= 23 || h < 5) ? (b.energy < 50 ? 'his eyelids keep drooping; it is the middle of the night' : 'drowsy; it is the middle of the night') : awake && h >= 21 ? 'getting sleepy as the evening goes on' : '';
  return { stomach, energy: energy + (drowsy ? ', ' + drowsy : '') };
}

/* ---------- doing things ---------- */
// Every activity is: walk to where it happens (if anywhere), then spend time doing it. Some have work
// that happens elsewhere while he does it (a research or coding sitting, a drawing being made); the activity
// lasts until both the time and the work are finished. When it ends, the world reports what actually happened.
let hooks = { onComplete: () => {}, onArrive: () => {}, onWorldEvent: () => {} };
export const setHooks = h => { hooks = { ...hooks, ...h }; };
export const DEFAULT_MINUTES = { go: 0, enter: 6, leave: 2, look: 12, read: 15, eat: 30, fish: 40, sleep: 0, nap: 70, rest: 40, wait: 30, think: 20, research: 90, code: 120, write: 70, draw: 70, paint_wall: 40, buy: 8, check_post: 15, stall: 25, leave_note: 10, take: 4, answer_order: 12, deliver_order: 10, list_for_sale: 10, unlist: 4, request: 15, withdraw_request: 4, propose: 6, publish: 10 };
const INDOOR_TYPES = new Set(['enter', 'eat', 'research', 'code', 'write', 'buy', 'check_post', 'sleep', 'nap', 'take', 'read']);

// act: { type, args, dest: {x,z} | null, place: id | null, needOpen: bool, enter: bool, minutes, caption, work: Promise | null, decision }
export function begin(act) {
  const a = { id: uid(), phase: 'walk', type: act.type, args: act.args || {}, place: act.place || null, needOpen: !!act.needOpen, enter: !!act.enter,
    minutes: Number.isFinite(act.minutes) ? clamp(act.minutes, 0, 900) : (DEFAULT_MINUTES[act.type] ?? 15), caption: str(act.caption, 120), decision: act.decision || null, startedT: S.t, facts: [],
    instant: act.instant || null, target: act.target || null, wall: act.wall || null };
  const dest = act.dest || (a.place ? placeById(a.place).door : null);
  if (dest && dist(dest, S.pos) > 0.6) {
    a.path = Town.route(S.town, S.pos, dest); a.wp = 0; a.tx = dest.x; a.tz = dest.z;
    if (S.inside && placeById(S.inside)) { a.facts.push('left ' + placeById(S.inside).name); S.inside = null; }
  } else { a.path = []; a.wp = 0; arrive(a); if (S.act === null && a.ended) return a; }
  S.act = a;
  if (act.work) attachWork(a, act.work);
  bump(); return a;
}
// some work runs alongside: a promise-returning function started on arrival (so he's at the desk when it starts)
function attachWork(a, workFn) { a.workFn = workFn; if (a.phase === 'do') startWork(a); }
function startWork(a) {
  if (!a.workFn || a.job) return;
  a.job = { done: false };
  Promise.resolve().then(() => a.workFn(a)).then(r => { a.job.result = r; }).catch(e => { a.job.error = String(e && e.message || e); })
    .finally(() => { a.job.done = true; bump(); });
}
function arrive(a) {
  const h = hourOf(S.t), p = a.place ? placeById(a.place) : null;
  if (p && !p.known) { p.known = true; S.town.ver++; }
  if (p && a.needOpen && !isOpen(p, h)) {
    a.facts.push(p.name + ' was shut: the door was locked and the lights were off');
    return end(a, { ok: false, reason: 'closed', facts: [] });
  }
  if (p && a.enter && p.h > 0) { S.inside = p.id; p.visits = (p.visits || 0) + 1; }
  if (p && p.h > 0) S.face = Math.atan2(p.x - S.pos.x, p.z - S.pos.z);
  if (a.type === 'go') a.facts.push(p ? 'arrived at ' + p.name : 'got to where he was heading' + (a.args && a.args.said_to ? ' (' + str(a.args.said_to, 40) + ')' : ''));
  a.doorsAtStart = doorsNearby();
  a.phase = 'do'; a.total = a.left = a.type === 'sleep' ? sleepMinutes(h) : a.minutes;
  hooks.onArrive(a, p);
  if (a.workFn) startWork(a);
  bump();
}
function sleepMinutes(h) { if (h >= 18) return Math.round((24 - h + 7) * 60); if (h < 7) return Math.max(60, Math.round((7 - h) * 60)); return 300; }
// stop what he's doing (the keeper removed a place, he's collapsed, etc.)
export function interrupt(why) { if (S.act) end(S.act, { ok: false, reason: 'interrupted', facts: [why] }); }
function end(a, outcome) {
  a.ended = true; S.act = null;
  outcome.facts = [...a.facts, ...(outcome.facts || [])];
  if (a.job && a.job.error && !outcome.error) outcome.error = a.job.error;
  hooks.onComplete(a, outcome); bump();
}
// physical effects of finishing an activity (what is objectively true afterwards)
function finish(a) {
  const f = [], h = hourOf(S.t), p = a.place ? placeById(a.place) : null;
  let ok = true, data = {};
  switch (a.type) {
    case 'eat': {
      if (p && p.type === 'home') { if (S.pantry > 0) { S.pantry--; S.body.fullness = clamp(S.body.fullness + 38, 0, 100); f.push('ate a tin of sardines from the cupboard (' + S.pantry + ' left)'); } else { ok = false; f.push('the cupboard was empty'); } break; }
      const price = 2;
      if (S.coins < price) { ok = false; f.push('could not pay: had ' + S.coins + ' coins, it costs ' + price); break; }
      S.coins -= price; S.body.fullness = clamp(S.body.fullness + (p && p.type === 'cafe' ? 30 : 45), 0, 100);
      f.push(p && p.type === 'cafe' ? 'had tea and a slice of cake at ' + p.name + ' for 2 coins' : 'bought a loaf at ' + (p ? p.name : 'the bakery') + ' for 2 coins and ate it');
      break;
    }
    case 'fish': {
      if (isDark(h)) { ok = false; f.push('too dark to see anything in the water'); break; }
      const caught = Math.random() < 0.7;
      if (caught) { S.body.fullness = clamp(S.body.fullness + 22, 0, 100); f.push('dived into the pond and caught a fish, and ate it'); } else f.push('dived into the pond several times and caught nothing');
      data.caught = caught; break;
    }
    case 'sleep': f.push('slept until ' + hhmm(S.t)); break;
    case 'nap': case 'rest': f.push((a.type === 'nap' ? 'napped' : 'rested') + ' for ' + Math.round(a.total) + ' minutes'); break;
    case 'buy': {
      const it = S.items.find(i => i.id === a.args.item);
      if (!it || it.sold) { ok = false; f.push('it was no longer in the window'); break; }
      if (S.coins < it.price) { ok = false; f.push('could not pay: it costs ' + it.price + ', had ' + S.coins); break; }
      S.coins -= it.price;
      if (it.food) { S.body.fullness = clamp(S.body.fullness + it.food, 0, 100); f.push('paid ' + it.price + ' coins for the ' + it.name + ' and ate it'); }
      else { S.inventory.push({ id: uid(), name: it.name, look: it.look || '', desc: it.desc || '', price: it.price, day: dayOf(S.t), img: it.img || '', model: it.model || null }); f.push('paid ' + it.price + ' coins for the ' + it.name + ' and took it'); }
      if (it.restock) { it.seen = true; } else { it.sold = true; it.boughtDay = dayOf(S.t); }
      data.item = it.name; break;
    }
    case 'check_post': data = collectPost(); f.push(...data.facts); break;
    case 'stall': data = stallVisit(); f.push(...data.facts); break;
    case 'take': {
      const pl = placeById(S.inside); const it = pl && pl.inside && pl.inside.items.find(i => i.id === a.args.item);
      if (!it || it.taken) { ok = false; f.push('it was not there'); break; }
      if (!it.canTake) { ok = false; f.push('it was too big or fixed in place to carry'); break; }
      it.taken = true; S.inventory.push({ id: uid(), name: it.name, look: it.look || '', desc: 'found in ' + pl.name, price: 0, day: dayOf(S.t) }); f.push('picked it up and took it'); break;
    }
    case 'leave_note': {
      const text = str(a.args.text, 800); if (!text) { ok = false; break; }
      S.percyNotes.push({ id: uid(), text, to: str(a.args.to, 40), day: dayOf(S.t) }); if (S.percyNotes.length > 80) S.percyNotes.shift();
      f.push('tucked a note under the stone'); break;
    }
    case 'paint_wall': {
      const can = S.inventory.findIndex(i => /paint/i.test(i.name));
      if (can < 0) { ok = false; f.push('had no paint'); break; }
      if (!a.wall) { ok = false; f.push('there was no free wall'); break; }
      S.inventory.splice(can, 1);
      const g = { id: uid(), by: 'percy', x: a.wall.x, y: 1.75, z: a.wall.z, nx: a.wall.nx, nz: a.wall.nz, w: 2.2, h: 2.3, place: a.wall.place, where: a.wall.where, tag: str(a.args.tag, 40), subject: str(a.args.subject, 120), day: dayOf(S.t) };
      S.graffiti.push(g); a.made = g; data.graffiti = g.id; f.push('painted on the wall ' + a.wall.where + ' (used up the paint)'); break;
    }
  }
  // doors that opened or closed nearby while he was busy, reported as things that happened
  if (a.doorsAtStart && !['sleep', 'nap'].includes(a.type)) for (const [id, was] of Object.entries(a.doorsAtStart)) { const q = placeById(id), now = q && isOpen(q, h); if (q && now !== was) f.push('meanwhile the door of ' + q.name + ' was ' + (now ? 'unlocked and opened (it is open now)' : 'closed and locked (it is shut now)')); }
  return { ok, facts: f, data };
}
// opening state of places with hours close to where he is (to notice doors changing while he waits)
function doorsNearby() { const out = {}; for (const p of S.town.places) if (TYPES[p.type] && TYPES[p.type].open && p.door && dist(p.door, S.pos) < 14 && (S.mind.knownPlaces[p.id])) out[p.id] = isOpen(p); return out; }

/* ---------- the clock: called several times a second with real seconds ---------- */
// the keeper's "Skip to morning": run the rest of this sleep straight through, ten town minutes at a time,
// so his body, the weather and the town all advance exactly as they would have (he decides nothing while asleep)
export function skipSleep() {
  const a = S.act; if (!(a && a.phase === 'do' && (a.type === 'sleep' || a.type === 'nap'))) return false;
  for (let i = 0; i < 200 && S.act === a; i++) tick(600 / timeScale(), () => {});
  return true;
}
export function tick(dt, onIdle) {
  const mins = dt * timeScale() / 60, before = S.t;
  S.t += mins;
  const d = dayOf(S.t); if (d !== S.lastDay) newDay(d);
  const h = Math.floor(hourOf(S.t)); if (h !== S.lastHour) { S.lastHour = h; onHour(h, d); }
  bodyTick(S.t - before);
  const a = S.act;
  if (!a) { if (!S.deciding) onIdle(); return; }
  if (a.phase === 'walk') {
    if (S.body.energy <= 0) { S.body.energy = 2; return end(a, { ok: false, reason: 'exhausted', facts: ['too exhausted to walk any further; had to stop ' + whereWords()] }); }
    let stepLen = WALK_SPEED * dt;
    while (stepLen > 0 && a.wp < a.path.length) {
      const wpt = a.path[a.wp], dx = wpt.x - S.pos.x, dz = wpt.z - S.pos.z, dd = Math.hypot(dx, dz);
      if (dd <= stepLen) { S.pos.x = wpt.x; S.pos.z = wpt.z; stepLen -= dd; a.wp++; }
      else { S.pos.x += dx / dd * stepLen; S.pos.z += dz / dd * stepLen; S.face = Math.atan2(dx, dz); stepLen = 0; }
    }
    if (a.wp >= a.path.length) arrive(a);
  } else if (a.phase === 'do') {
    a.left -= S.t - before;
    const busy = a.job && !a.job.done;
    if (a.left <= 0 && !busy) { const out = finish(a); if (a.job) { out.result = a.job.result; out.error = a.job.error; } end(a, out); }
    else if (S.body.energy <= 0 && !['sleep', 'nap', 'rest'].includes(a.type) && !busy) end(a, { ok: false, reason: 'exhausted', facts: ['too exhausted to carry on'] });
  }
}
export function whereWords(pos = S.pos) {
  if (S.inside && placeById(S.inside)) return 'inside ' + placeById(S.inside).name;
  const p = placeAt(pos); if (p && p.known) return 'at ' + p.name;
  const r = roadAt(pos.x, pos.z); return r ? 'on ' + r : 'out in the open';
}

/* ---------- weather, ambient happenings, growth ---------- */
function weightedPick(list) { const tot = list.reduce((s, x) => s + x[1], 0); let r = Math.random() * tot; for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[0][0]; }
function onHour(h, d) {
  if (S.t >= S.weather.until) {
    const prev = S.weather.kind, next = weightedPick(WEATHER[seasonOf(d)]);
    S.weather = { kind: next, until: S.t + (3 + Math.random() * 6) * 60, since: S.t };
    if (next !== prev) { wlog('the weather turned ' + next); worldEvent({ kind: 'weather', where: 'outdoors', text: 'the weather turns ' + ({ clear: 'clear', cloudy: 'cloudy', wind: 'windy', fog: 'foggy', snow: 'to snow', rain: 'to rain' })[next] }); }
  }
  if (Math.random() < 0.05) { const ev = pick(AMBIENT.filter(e => !e.night || isDark(h))); if (ev) { wlog('ambient: ' + ev.text); worldEvent({ kind: 'ambient', where: ev.where, text: ev.text }); } }
  if (h === 5 && config.growEveryDays > 0 && d > 1 && (d - 1) % config.growEveryDays === 0) growTown('time');
  for (const it of S.items) if (it.restock) it.sold = false;
}
// something happened at a time and place; perception decides whether Percy experienced it
export function worldEvent(ev) { const e = { id: uid(), t: S.t, day: dayOf(S.t), x: S.pos.x, z: S.pos.z, ...ev }; S.events.push(e); if (S.events.length > 60) S.events.shift(); hooks.onWorldEvent(e); }
export function growTown(by = 'time') {
  const g = Town.grow(S.town, { day: dayOf(S.t) });
  const n = S.town.nodes[g.edge.b];
  wlog('the fog pulled back along ' + g.road + (g.place ? '; ' + g.place.name + ' stands there now' : '') + ' (' + by + ')');
  worldEvent({ kind: 'growth', where: 'near', x: n.x, z: n.z, road: g.road, text: 'more of ' + g.road + ' is visible than before; the fog has drawn back' });
  bump(); return g;
}
function newDay(d) {
  S.lastDay = d; S.worldLog[d] = S.worldLog[d] || [];
  const keys = Object.keys(S.worldLog).map(Number).sort((a, b) => a - b);
  while (keys.length > 10) delete S.worldLog[keys.shift()];
  if (d > 1 && (d - 1) % 7 === 0) wlog('the season turned to ' + seasonOf(d));
}

/* ---------- the keeper's tools (environmental, never behavioural) ---------- */
export function spotProblem(x, z, size = 1.6) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Pick a spot first.';
  if (Math.hypot(x, z) > S.town.R + 8) return 'That\'s too deep in the fog. Try nearer the edge of town.';
  for (const p of S.town.places) if (Math.hypot(p.x - x, p.z - z) < Math.hypot(p.w, p.d) / 2 * 0.8 + size) return 'That spot is too close to ' + p.name + '.';
  for (const t of S.things) if (Math.hypot(t.x - x, t.z - z) < (t.size || 3) * 0.4 + size) return 'That spot is too close to something already there.';
  return null;
}
export function addThing({ name, desc, x, z, size = 3, forRequest = '' }) {
  const th = { id: uid(), name: str(name, 60) || 'something', desc: str(desc, 200), look: '', label: '', x, z, size, day: dayOf(S.t), status: 'building', model: null, forRequest };
  S.things.push(th); wlog('the keeper placed ' + th.name + ' near ' + nearestKnownName(x, z, true)); bump(); return th;
}
export function removeThing(id) {
  const th = thingById(id); if (!th) return;
  S.things = S.things.filter(t => t !== th); S.vanished.push({ id: th.id, x: th.x, z: th.z, kind: 'thing', day: dayOf(S.t) });
  if (S.act && S.act.args && S.act.args.target === th.id) interrupt('it was no longer there');
  wlog('the keeper removed ' + th.name); bump();
}
export function addBuilding({ kind, name, desc, x, z }) {
  if (!BUILDABLE.includes(kind)) return { error: 'Pick one of the building types.' };
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { error: 'Pick a spot.' };
  if (Math.hypot(x, z) > S.town.R + 12) return { error: 'That\'s too deep in the fog. Try nearer the edge of town.' };
  const T = TYPES[kind]; const rot = Town.facingRot(S.town, x, z);
  if (!Town.fits(S.town, x, z, T.w, T.d, rot)) return { error: 'Not enough room there. Try a bit further from the road and other buildings.' };
  const p = Town.addPlace(S.town, { type: kind, name: str(name, 50) || (kind === 'house' ? 'a house' : 'the ' + T.label), desc, x, z, rot, known: false, builtBy: 'keeper', day: dayOf(S.t) });
  wlog('the keeper built ' + p.name); bump(); return { place: p };
}
export function removeBuilding(id) {
  const p = placeById(id); if (!p) return { error: 'That building isn\'t there any more.' };
  if (p.type === 'home') return { error: 'That\'s Percy\'s cottage. He needs somewhere to live.' };
  if (S.act && (S.act.place === p.id)) interrupt(p.name + ' was no longer there');
  if (S.inside === p.id) S.inside = null;
  Town.removePlace(S.town, p.id);
  S.items = S.items.filter(i => i.shop !== p.id || i.sold);
  S.vanished.push({ id: p.id, x: p.door.x, z: p.door.z, kind: 'building', name: p.name, day: dayOf(S.t) });
  wlog('the keeper removed ' + p.name); bump(); return { place: p };
}
export function stockItem({ shop, name, price, desc }) {
  const p = placeById(shop);
  if (!p || !['shop', 'bakery', 'cafe', 'market', 'post', 'workshop', 'museum'].includes(p.type)) return { error: 'Pick a shop to put it in.' };
  const it = { id: uid(), shop: p.id, name: str(name, 60), look: '', desc: str(desc, 240), price: clamp(Math.round(Number(price) || 10), 1, 999), day: dayOf(S.t), seen: false, sold: false, status: 'building', model: null };
  if (!it.name) return { error: 'Give it a name.' };
  S.items.push(it); wlog('the keeper put ' + it.name + ' in the window of ' + p.name); bump(); return { item: it };
}
function nearestKnownName(x, z, any = false) {
  let b = 'the middle of town', bd = Infinity;
  for (const p of S.town.places) { if (!any && !p.known) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p.name; } }
  return b;
}

/* ---------- money: the stall, orders (commissions), his shop, the post ---------- */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() { let c; do { c = 'PCY-' + Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (S.shop.some(x => x.code === c) || S.commissions.some(x => x.code === c)); return c; }
export const COMMISSION_KINDS = { drawing: 'a drawing', page: 'something written', web: 'a web page or small program' };
export const pounds = coins => Math.max(1, Math.round(coins / config.coinsPerPound * 100) / 100);
// A real person takes a drawing from his stall (a visitor to the page). He only ever finds the coins.
export function buyDrawing(id, { coins, print = false } = {}) {
  const dr = S.drawings.find(d => d.id === id);
  if (!dr) return { error: 'That drawing isn\'t here any more.' };
  if (print) { const c = Math.max(1, Math.round(Number(coins) || 10)); S.tin += c; dr.prints = (dr.prints || 0) + 1; wlog('a print of "' + dr.title + '" was sold'); bump(); return { ok: true }; }
  if (!dr.onStall || dr.sold) return { error: dr.sold ? 'Someone has already taken that one.' : 'Percy hasn\'t put that one out on his stall.' };
  dr.sold = true; dr.soldDay = dayOf(S.t); S.tin += dr.price || 3; wlog('a visitor took "' + dr.title + '" from the stall'); bump(); return { ok: true, price: dr.price || 3 };
}
function stallVisit() {
  const facts = [], gone = S.drawings.filter(d => d.sold && d.onStall && !d.noticedGone);
  const coins = S.tin; S.tin = 0; S.coins += coins; S.earned.stall += coins;
  for (const d of gone) d.noticedGone = true;
  if (gone.length) facts.push(gone.map(d => '"' + d.title + '"').join(', ') + (gone.length === 1 ? ' was' : ' were') + ' gone from the stall');
  facts.push(coins ? 'found ' + coins + ' coins in the honesty tin' : 'the honesty tin was empty');
  const toPlace = S.drawings.filter(d => !d.sold && !d.onStall && !d.listed && !d.forOrder && d.offerAtStall);
  for (const d of toPlace) { d.onStall = true; d.price = d.price || 3; }
  if (toPlace.length) facts.push('left ' + toPlace.map(d => '"' + d.title + '" (' + d.price + ' coins)').join(', ') + ' out on the stall');
  return { facts, coins, gone: gone.map(d => d.id) };
}
export function postCommission({ text, kind, from, offer }) {
  text = str(text, 500); if (!text) return { error: 'Say what you would like him to make.' };
  if (!COMMISSION_KINDS[kind]) kind = 'drawing';
  if (S.commissions.filter(c => c.status === 'posted').length >= 10) return { error: 'There is already a pile of letters waiting for him. Try again after he has been to the post office.' };
  const c = { id: uid(), code: newCode(), text, kind, from: str(from, 30), offer: clamp(Math.round(Number(offer) || 5), 1, 20), paidReal: 0, day: dayOf(S.t), status: 'posted', reply: '' };
  S.commissions.unshift(c); if (S.commissions.length > 80) S.commissions.length = 80;
  wlog('an order arrived at the post office'); bump(); return { commission: c };
}
// Money from outside (Ko-fi or the keeper) waits at the post office as an envelope.
export function receivePayment({ coins, from = '', message = '', code = '', amount = '', source = 'kofi', ref = '', isPublic = true }) {
  coins = Math.max(1, Math.round(Number(coins) || 0));
  if (ref && S.payments.some(p => p.ref === ref)) return { duplicate: true };
  const m = String(message || '').toUpperCase().match(/PCY-[A-Z0-9]{4}/); code = String(code || (m ? m[0] : '')).toUpperCase();
  const listing = code ? S.shop.find(x => x.code === code) : null, job = code ? S.commissions.find(x => x.code === code) : null;
  if (isPublic === false) { from = ''; message = ''; }
  const env = { id: uid(), coins, from: str(from, 40), message: str(message, 500), day: dayOf(S.t), collected: false, source, forShop: listing ? listing.id : '', forJob: job ? job.id : '', public: isPublic !== false };
  if (listing && !listing.sold) { listing.sold = true; listing.soldDay = dayOf(S.t); listing.buyer = env.from; env.forTitle = listing.title; const d = listing.kind === 'drawing' && S.drawings.find(x => x.id === listing.ref); if (d) { d.sold = true; d.onStall = false; } if (listing.kind === 'thing') S.inventory = S.inventory.filter(i => i.id !== listing.ref); }
  if (job) { job.paidReal = (job.paidReal || 0) + coins; env.forTitle = 'the order: ' + job.text.slice(0, 60); }
  S.post.push(env); if (S.post.length > 120) S.post.shift();
  S.payments.push({ ref: str(ref, 80), day: dayOf(S.t), coins, amount: str(amount, 20), source, code, from: env.from }); if (S.payments.length > 300) S.payments.shift();
  wlog('an envelope (' + coins + ' coins, ' + source + ') arrived at the post office'); bump();
  return { envelope: env, listing, job };
}
// a letter from the keeper (replies to his requests): it waits at the post office like any other post
export function keeperLetter(text, about = '') { const l = { id: uid(), text: str(text, 1500), about: str(about, 40), day: dayOf(S.t), collected: false }; S.letters.push(l); if (S.letters.length > 100) S.letters.shift(); wlog('the keeper posted a letter' + (about ? ' about ' + about : '')); bump(); return l; }
export const postWaiting = () => S.post.some(p => !p.collected) || S.letters.some(l => !l.collected) || S.commissions.some(c => c.status === 'posted');
function collectPost() {
  const envs = S.post.filter(p => !p.collected), letters = S.letters.filter(l => !l.collected), orders = S.commissions.filter(c => c.status === 'posted');
  const facts = []; let coins = 0;
  for (const e of envs) { e.collected = true; e.collectedDay = dayOf(S.t); coins += e.coins; }
  S.coins += coins; S.earned.real += coins;
  for (const l of letters) { l.collected = true; l.collectedDay = dayOf(S.t); }
  for (const c of orders) { c.status = 'read'; c.readDay = dayOf(S.t); }
  if (envs.length) facts.push(envs.length + ' envelope' + (envs.length > 1 ? 's' : '') + ' with ' + coins + ' coins in total');
  if (letters.length) facts.push(letters.length + ' letter' + (letters.length > 1 ? 's' : '') + ' from the keeper');
  if (orders.length) facts.push(orders.length + ' letter' + (orders.length > 1 ? 's' : '') + ' asking him to make something for coins');
  if (!facts.length) facts.push('there was no post');
  return { facts, coins, envelopes: envs.map(e => ({ coins: e.coins, from: e.from, message: e.message, forTitle: e.forTitle || '' })), letters: letters.map(l => ({ id: l.id, text: l.text, about: l.about })), orders: orders.map(c => ({ id: c.id, text: c.text, kind: c.kind, from: c.from, offer: c.offer, paidReal: c.paidReal })) };
}
export function answerOrder(id, accept, reply) {
  const c = S.commissions.find(x => x.id === id && ['read', 'posted'].includes(x.status)); if (!c) return { error: 'no such order waiting' };
  c.status = accept ? 'accepted' : 'declined'; c.reply = str(reply, 400); c.decidedDay = dayOf(S.t);
  wlog((accept ? 'accepted' : 'declined') + ' an order: ' + c.text.slice(0, 60)); bump(); return { order: c };
}
export function deliverOrder(id, result) {
  const c = S.commissions.find(x => x.id === id && x.status === 'accepted'); if (!c) return { error: 'no such accepted order' };
  c.status = 'done'; c.doneDay = dayOf(S.t); c.result = result;
  S.coins += c.offer; S.earned.work += c.offer;
  wlog('delivered an order and was paid ' + c.offer + ' coins'); bump(); return { order: c, paid: c.offer };
}
export function setListing({ kind, ref, title, price, blurb }) {
  const ex = S.shop.find(x => x.ref === ref && !x.sold && !x.withdrawn);
  price = clamp(Math.round(Number(price) || 0), 1, 500);
  if (ex) { ex.price = price; if (blurb) ex.blurb = str(blurb, 300); bump(); return ex; }
  const l = { id: uid(), code: newCode(), kind, ref, title: str(title, 70), blurb: str(blurb, 300), price, day: dayOf(S.t), sold: false };
  if (kind === 'drawing') { const d = S.drawings.find(x => x.id === ref); if (d) { d.onStall = false; d.listed = true; } }
  S.shop.push(l); if (S.shop.length > 150) S.shop.splice(0, S.shop.length - 150);
  wlog('listed "' + l.title + '" for ' + price + ' coins'); bump(); return l;
}
export function withdrawListing(ref) { const l = S.shop.find(x => (x.id === ref || x.ref === ref || x.code === ref) && !x.sold && !x.withdrawn); if (!l) return null; l.withdrawn = true; const d = l.kind === 'drawing' && S.drawings.find(x => x.id === l.ref); if (d) d.listed = false; bump(); return l; }
export const openListings = () => S.shop.filter(x => !x.sold && !x.withdrawn);

/* ---------- what the page shows ---------- */
export function publicTown() {
  const t = S.town;
  return { ver: t.ver, R: t.R, nodes: t.nodes, edges: t.edges, places: t.places.map(p => ({ id: p.id, type: p.type, name: p.name, x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, rot: p.rot, door: p.door, known: p.known, seed: p.seed, builtBy: p.builtBy, label: TYPES[p.type].label })) };
}
