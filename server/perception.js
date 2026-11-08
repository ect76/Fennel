// What Percy can plausibly perceive right now: never the world's full truth, never analytics.
// Things are described by how they look until he has learned what they are or named them himself.
import * as W from './world.js';
import * as Town from './town.js';
import { str } from './util.js';

const SIGHT = 26, NEAR_THING = 16, HEAR = 30;
// how a building looks from outside (a sign gives its name; the rest is appearance)
const LOOK = {
  home: 'a small timber-framed cottage', bakery: 'a shop with a striped awning and a window full of shelves', library: 'a tall stone building with steps and big arched windows',
  market: 'a wooden stall with a canopy, standing on its own', cafe: 'a little shop with tables in the window and a teapot painted on the sign',
  post: 'a brick building with a red box by the door and a lamp in the window', station: 'a long low building beside two iron rails that run off into the fog',
  green: 'an open patch of grass with a pond in the middle', lookout: 'a grassy hill with a bench on top', stone: 'a tall grey standing stone, taller than a door',
  tower: 'a narrow tower with a clock face near the top', house: 'a house', shop: 'a shop with a painted sign and a display window', workshop: 'a workshop with wide doors',
  garden: 'a walled garden', museum: 'a grand building with columns', hall: 'a large hall with tall windows',
};
const SIGN = { home: 'a name painted on the door', green: 'a small sign', stone: 'a weathered plaque at its foot', lookout: 'a signpost', market: 'a board on the canopy', house: '' };
function bearing(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  if (d < 3.5) return 'right here';
  const a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; // -z is north
  const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(a / 45) % 8];
  const far = d < 12 ? 'close by' : d < 22 ? 'a short walk' : 'further off';
  return far + ', to the ' + dir;
}
const mind = () => W.S.mind;
export function knowsPlace(id) { return !!mind().knownPlaces[id]; }
export function thingName(th) { const k = mind().knownThings[th.id]; return (k && k.name) || null; }
export function thingWords(th) { const n = thingName(th); return n ? n + ' (' + (th.look || 'an object') + ')' : (th.look || 'an object about ' + (th.size || 2) + ' units tall'); }

// mark what he can see as seen (this is what makes a place "known" to him), and say what's newly seen
function noteSeen(list, key, id, extra = {}) { const m = mind()[key]; if (!m[id]) { m[id] = { firstSeen: W.S.t, firstDay: W.dayOf(W.S.t), ...extra }; return true; } return false; }

export function perceive({ sinceT = 0, watchers = 0 } = {}) {
  const S = W.S, pos = S.pos, h = W.hourOf(S.t), dark = W.isDark(h), out = { newly: [] };
  const inside = S.inside ? W.placeById(S.inside) : null;
  out.when = 'day ' + W.dayOf(S.t) + ', ' + W.hhmm(S.t) + (dark ? ' (dark outside)' : '') + ', ' + W.seasonOf(W.dayOf(S.t));
  out.weather = S.weather.kind;
  out.where = W.whereWords();
  out.body = W.bodySense();
  out.coins = S.coins;
  // inside a building: what's in the room
  if (inside) {
    noteSeen(inside, 'knownPlaces', inside.id, { name: inside.name }); inside.known = true;
    const km = mind().knownPlaces[inside.id]; km.entered = (km.entered || 0) + (km.lastInT === S.t ? 0 : 1); km.lastInT = S.t;
    if (inside.type === 'home') {
      out.room = [S.initial.cottage, 'tins left in the cupboard: ' + S.pantry, ...(S.inventory.length ? ['things he keeps here: ' + S.inventory.map(i => i.name).join(', ')] : []),
        ...(S.drawings.filter(d => !d.sold).length ? [S.drawings.filter(d => !d.sold).length + ' of his drawings lying about'] : [])];
    } else if (inside.inside && inside.inside.items) {
      out.room = [inside.inside.feel || ''].concat(inside.inside.items.filter(i => !i.taken).map(i => 'item ' + i.id + ': ' + (i.examined && i.name ? i.name + ' (' + i.look + ')' : i.look) + (i.text && i.examined ? ' [writing on it: "' + i.text + '"]' : i.text ? ' [there is writing on it]' : '')));
    } else out.room = ['he has not looked around in here yet'];
    const items = S.items.filter(it => it.shop === inside.id && !it.sold && it.status !== 'building');
    if (items.length) { out.forSale = items.map(it => ({ id: it.id, what: it.name, look: it.look || '', price: it.price })); for (const it of items) it.seen = true; }
    if (inside.type === 'post') out.post = W.postWaiting() ? 'there is post waiting at the counter for him' : 'nothing waiting at the counter';
  }
  // the street: buildings, things, roads, fog, within sight
  if (!inside || inside.type === 'home') {
    const seeR = inside ? 12 : (dark ? SIGHT * 0.6 : S.weather.kind === 'fog' ? SIGHT * 0.5 : SIGHT);
    out.places = [];
    for (const p of S.town.places) {
      if (p.type === 'home' && inside) continue;
      const d = Math.hypot(p.door.x - pos.x, p.door.z - pos.z); if (d > seeR + Math.max(p.w, p.d) / 2) continue;
      const fresh = noteSeen(p, 'knownPlaces', p.id, { name: p.name }); if (!p.known) { p.known = true; S.town.ver++; }
      if (fresh) out.newly.push('place:' + p.id);
      const lit = W.TYPES[p.type].open ? (W.isOpen(p, h) ? 'lights on' : 'dark, door shut') : '';
      out.places.push({ id: p.id, sign: SIGN[p.type] === '' ? '' : (p.signText || p.name), look: LOOK[p.type] || W.TYPES[p.type].label, where: bearing(pos, p.door), lit, firstTime: fresh });
    }
    if (!inside) {
      out.things = [];
      for (const th of S.things) {
        if (th.status !== 'ready') continue;
        const d = Math.hypot(th.x - pos.x, th.z - pos.z); if (d > (dark ? NEAR_THING * 0.6 : NEAR_THING)) continue;
        const fresh = noteSeen(th, 'knownThings', th.id, { stage: 'noticed' }); if (fresh) out.newly.push('thing:' + th.id);
        out.things.push({ id: th.id, what: thingWords(th), where: bearing(pos, th), firstTime: fresh, label: th.label && d < 6 ? th.label : '' });
      }
      out.graffiti = S.graffiti.filter(g => Math.hypot(g.x - pos.x, g.z - pos.z) < 12).map(g => ({ id: g.id, where: g.where, by: g.by === 'percy' ? 'his own' : 'not his', what: g.look || (g.by === 'percy' ? g.subject : 'paint on the wall: shapes and colours') }));
      // roads by their signs, and where they run into the fog
      const roads = new Set();
      for (const e of S.town.edges) { if (e.path) continue; const A = S.town.nodes[e.a], B = S.town.nodes[e.b]; const s = Town.segInfo(pos.x, pos.z, A.x, A.z, B.x, B.z); if (s.d < 20) roads.add(e.name); }
      out.roads = [...roads].map(r => ({ name: r, walked: mind().roadsWalked.includes(r) }));
      out.fog = Town.endNodes(S.town).map(id => S.town.nodes[id]).filter(n => Math.hypot(n.x - pos.x, n.z - pos.z) < 22).map(n => { const e = S.town.edges.find(x => !x.path && (S.town.nodes[x.a] === n || S.town.nodes[x.b] === n)); return (e ? e.name : 'a road') + ' runs into thick fog ' + bearing(pos, n); });
      const stone = S.town.places.find(p => p.type === 'stone');
      if (stone && Math.hypot(stone.x - pos.x, stone.z - pos.z) < 6) { const unread = S.notes.filter(n => !n.read).length; out.stone = unread ? unread + ' folded paper' + (unread > 1 ? 's' : '') + ' tucked under the stone' : 'nothing under the stone'; }
      const market = S.town.places.find(p => p.type === 'market');
      if (market && Math.hypot(market.door.x - pos.x, market.door.z - pos.z) < 6) { const on = S.drawings.filter(d => d.onStall && !d.sold).length; out.stall = 'the stall has ' + (on ? on + ' of his drawings on it' : 'nothing on it') + ' and the honesty tin'; }
      const post = S.town.places.find(p => p.type === 'post');
      if (post && Math.hypot(post.door.x - pos.x, post.door.z - pos.z) < 16 && W.postWaiting()) out.postLamp = 'the lamp in the post office window is lit';
      for (const v of S.vanished) if (!v.noticed && Math.hypot(v.x - pos.x, v.z - pos.z) < 10 && (mind().knownPlaces[v.id] || mind().knownThings[v.id])) { v.noticed = true; (out.absences = out.absences || []).push((v.name || 'the ' + (thingName(v) || 'object he had seen there')) + ' is no longer where it was'); }
    }
  }
  // a cue, not an analytic: the stone hums while people outside are watching
  const stone = S.town.places.find(p => p.type === 'stone');
  if (watchers > 0 && stone && Math.hypot(stone.x - pos.x, stone.z - pos.z) < HEAR) out.hum = 'the standing stone is humming';
  // things that happened since he last took stock, that he could have seen or heard
  out.events = S.events.filter(e => e.t > sinceT && (e.where === 'anywhere' || (e.where === 'outdoors' && (!inside || e.kind === 'weather')) || (e.where === 'near' && Math.hypot(e.x - pos.x, e.z - pos.z) < SIGHT))).map(e => W.hhmm(e.t) + ' ' + e.text);
  return out;
}

// a compact text form for the decision prompt
export function describe(p) {
  const L = [];
  L.push('Time: ' + p.when + '. Weather: ' + p.weather + '.');
  L.push('Where: ' + p.where + '.');
  L.push('Body: stomach ' + p.body.stomach + '; energy ' + p.body.energy + '. Coins in pocket: ' + p.coins + '.');
  if (p.room) L.push('In the room: ' + p.room.filter(Boolean).join('; ') + '.');
  if (p.forSale) L.push('For sale here: ' + p.forSale.map(f => 'item ' + f.id + ': ' + f.what + (f.look ? ' (' + f.look + ')' : '') + ', ' + f.price + ' coins').join('; ') + '.');
  if (p.post) L.push(p.post + '.');
  if (p.places && p.places.length) L.push('Buildings in view: ' + p.places.map(x => 'place ' + x.id + ': ' + x.look + (x.sign ? ' with a sign reading "' + x.sign + '"' : '') + ' (' + x.where + (x.lit ? ', ' + x.lit : '') + ')' + (x.firstTime ? ' [first time seeing it]' : '')).join('; ') + '.');
  if (p.things && p.things.length) L.push('Objects in view: ' + p.things.map(x => 'thing ' + x.id + ': ' + x.what + ' (' + x.where + ')' + (x.label ? ' with lettering: "' + x.label + '"' : '') + (x.firstTime ? ' [first time seeing it]' : '')).join('; ') + '.');
  if (p.graffiti && p.graffiti.length) L.push('Painted walls: ' + p.graffiti.map(g => g.where + ' (' + g.by + '): ' + g.what).join('; ') + '.');
  if (p.roads && p.roads.length) L.push('Street signs nearby: ' + p.roads.map(r => r.name + (r.walked ? '' : ' (not walked yet)')).join(', ') + '.');
  if (p.fog && p.fog.length) L.push('Fog: ' + p.fog.join('; ') + '.');
  if (p.stone) L.push('At the stone: ' + p.stone + '.');
  if (p.stall) L.push('At the market: ' + p.stall + '.');
  if (p.postLamp) L.push(p.postLamp + '.');
  if (p.absences) L.push('Missing: ' + p.absences.join('; ') + '.');
  if (p.hum) L.push('Sound: ' + p.hum + '.');
  if (p.events && p.events.length) L.push('Since he last took stock: ' + p.events.join('; ') + '.');
  return L.join('\n');
}
