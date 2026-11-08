// Mossbrook's layout: a road network, buildings on plots beside the roads, and the fog that surrounds it all.
// The town can grow: roads extend out of the fog and new buildings appear, by themselves or when the keeper adds them.
import { rng, pick, uid, str } from './util.js';

export const TYPES = {
  home:     { label: 'cottage', w: 7, d: 6, h: 3.4, acts: ['sleep', 'nap', 'draw', 'write', 'tidy'] },
  bakery:   { label: 'bakery', w: 7, d: 6, h: 3.6, open: [7, 19], acts: ['eat'] },
  library:  { label: 'library', w: 10, d: 7, h: 5.5, open: [9, 18], acts: ['read'] },
  market:   { label: 'market stall', w: 4, d: 3, h: 2.8, acts: ['sell'] },
  cafe:     { label: 'café', w: 7, d: 6, h: 3.4, open: [8, 17], acts: ['visit'], feel: { joy: 8, calm: 6 } },
  post:     { label: 'post office', w: 7, d: 6, h: 3.6, open: [9, 17], acts: ['visit'], feel: { wonder: 5 } },
  station:  { label: 'railway station', w: 13, d: 5, h: 3.8, acts: ['visit'], feel: { wonder: 8 } },
  green:    { label: 'village green with a pond', w: 12, d: 12, h: 0, acts: ['pond', 'fish'] },
  lookout:  { label: 'lookout hill', w: 13, d: 13, h: 3, acts: ['stargaze'] },
  stone:    { label: 'standing stone', w: 6, d: 6, h: 4.5, acts: ['shrine'] },
  tower:    { label: 'clock tower', w: 5, d: 5, h: 13, acts: ['visit'], feel: { wonder: 8 } },
  house:    { label: 'house', w: 6, d: 6, h: 3.4, acts: ['visit'], feel: { wonder: 4, calm: -1 } },
  shop:     { label: 'shop', w: 6, d: 6, h: 3.6, open: [9, 17], acts: ['visit'], feel: { joy: 4, wonder: 4 } },
  workshop: { label: 'workshop', w: 8, d: 6, h: 3.8, acts: ['visit'], feel: { wonder: 6 } },
  garden:   { label: 'garden', w: 10, d: 10, h: 0, acts: ['visit'], feel: { calm: 12 } },
  museum:   { label: 'museum', w: 10, d: 7, h: 5, open: [10, 17], acts: ['visit'], feel: { wonder: 14 } },
  hall:     { label: 'hall', w: 10, d: 7, h: 5, acts: ['visit'], feel: { wonder: 6 } },
};
export const BUILDABLE = ['house', 'shop', 'cafe', 'workshop', 'garden', 'museum', 'tower', 'hall'];

const ROAD_NAMES = ['Thistle Lane', 'Bellwether Row', 'Copper Street', 'Lantern Walk', 'Wren Close', 'Orchard Rise', 'Moth Lane', 'Salt Street', 'Quill Way', 'Hollow Lane', 'Kettle Row', 'Button Street', 'Mallow Walk', 'Fernside', 'Tinker\'s Way', 'Starling Road'];
const PLACE_NAMES = {
  shop: ['Pim\'s Hardware', 'The Button Shop', 'Odd Socks & Co.', 'Hattersley Clocks', 'The Map Seller', 'Vell\'s Seeds', 'The Umbrella Shop', 'Marrow & Daughters', 'The Lost Property Office'],
  workshop: ['the old printing works', 'a clockmaker\'s workshop', 'the boatbuilder\'s shed', 'the bell foundry', 'the kite maker\'s'],
  museum: ['the Museum of Small Things', 'the Weather Museum', 'the Museum of Maps'],
  garden: ['the walled garden', 'the herb garden', 'the sunken garden', 'the allotments'],
  hall: ['the village hall', 'the music hall', 'the old schoolhouse'],
  tower: ['the water tower', 'the bell tower', 'the old windmill'],
  cafe: ['Dot\'s Tearoom', 'The Spoon', 'The Lantern Café'],
};

/* ---------- geometry helpers ---------- */
export function segInfo(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t, z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}
export function nearestRoad(town, x, z) {
  let best = null;
  for (const e of town.edges) {
    const A = town.nodes[e.a], B = town.nodes[e.b];
    const s = segInfo(x, z, A.x, A.z, B.x, B.z);
    if (!best || s.d < best.d) best = { ...s, edge: e };
  }
  return best;
}
const radiusOf = p => Math.hypot(p.w, p.d) / 2 * 0.8;
function updateR(town) {
  let r = 0;
  for (const id in town.nodes) { const n = town.nodes[id]; r = Math.max(r, Math.hypot(n.x, n.z)); }
  for (const p of town.places) r = Math.max(r, Math.hypot(p.x, p.z) + radiusOf(p));
  town.R = Math.round((r + 5) * 10) / 10;
}
// corners of a rotated rectangle (local +z is the front, facing the road)
export function corners(x, z, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c }));
}
function overlap(a, b, margin) {
  // separating axis test for two rectangles (each a list of 4 corners), grown by a margin
  for (const poly of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const p1 = poly[i], p2 = poly[i + 1], ax = p2.z - p1.z, az = p1.x - p2.x, L = Math.hypot(ax, az);
      const proj = q => q.map(p => (p.x * ax + p.z * az) / L);
      const pa = proj(a), pb = proj(b);
      if (Math.max(...pa) + margin < Math.min(...pb) || Math.max(...pb) + margin < Math.min(...pa)) return false;
    }
  }
  return true;
}
function rectRoadGap(town, rect, x, z) {
  let gap = Infinity;
  const pts = [];
  for (let i = 0; i < 4; i++) { const a = rect[i], b = rect[(i + 1) % 4]; for (let k = 0; k < 6; k++) pts.push({ x: a.x + (b.x - a.x) * k / 6, z: a.z + (b.z - a.z) * k / 6 }); }
  pts.push({ x, z });
  for (const e of town.edges) {
    const A = town.nodes[e.a], B = town.nodes[e.b];
    for (const p of pts) gap = Math.min(gap, segInfo(p.x, p.z, A.x, A.z, B.x, B.z).d);
  }
  return gap;
}
export function facingRot(town, x, z) {
  const n = nearestRoad(town, x, z); const dx = n.x - x, dz = n.z - z, L = Math.hypot(dx, dz) || 1;
  return Math.atan2(dx / L, dz / L);
}
export function fits(town, x, z, w, d, rot = facingRot(town, x, z), ignoreId) {
  const rect = corners(x, z, w, d, rot);
  if (rectRoadGap(town, rect, x, z) < 2.0) return false;
  for (const p of town.places) { if (p.id === ignoreId) continue; if (overlap(rect, corners(p.x, p.z, p.w, p.d, p.rot), 1.2)) return false; }
  for (const t of town.things || []) if (rect.some(c => Math.hypot(t.x - c.x, t.z - c.z) < 2) || Math.hypot(t.x - x, t.z - z) < Math.max(w, d) / 2 + 1.5) return false;
  return true;
}

/* ---------- placing buildings ---------- */
export function addPlace(town, { type, name, desc = '', x, z, rot, known = true, builtBy = 'world', day = 1, seed }) {
  const T = TYPES[type];
  const near = nearestRoad(town, x, z);
  if (rot == null) rot = facingRot(town, x, z);
  const fx = Math.sin(rot), fz = Math.cos(rot);
  const inset = ['green', 'lookout', 'garden'].includes(type) ? -2 : ['stone', 'market'].includes(type) ? 0.9 : 1.3;
  const p = {
    id: uid(), type, name: str(name, 50) || T.label, desc: str(desc, 240), x, z, w: T.w, d: T.d, h: T.h, rot,
    door: { x: x + fx * (T.d / 2 + inset), z: z + fz * (T.d / 2 + inset) },
    known, builtBy, day, seed: seed ?? Math.floor(Math.random() * 1e9), visits: 0,
  };
  // a footpath if the door is a long way from the road
  if (near.d - T.d / 2 > 6) {
    const split = splitEdge(town, near.edge, near.t);
    const nid = 'p' + uid();
    town.nodes[nid] = { x: p.door.x, z: p.door.z };
    town.edges.push({ id: uid(), a: split, b: nid, name: 'a footpath', path: true });
  }
  town.places.push(p); updateR(town); town.ver++;
  return p;
}
// Take a building away (and the footpath that led to its door, if it had one).
export function removePlace(town, id) {
  const p = town.places.find(x => x.id === id); if (!p) return null;
  town.places = town.places.filter(x => x !== p);
  for (const [nid, n] of Object.entries(town.nodes)) {
    if (!nid.startsWith('p') || Math.hypot(n.x - p.door.x, n.z - p.door.z) > 0.01) continue;
    town.edges = town.edges.filter(e => !(e.path && (e.a === nid || e.b === nid))); delete town.nodes[nid];
  }
  town.ver++;
  return p;
}
function splitEdge(town, e, t) {
  if (t < 0.05) return e.a; if (t > 0.95) return e.b;
  const A = town.nodes[e.a], B = town.nodes[e.b];
  const nid = 's' + uid(); town.nodes[nid] = { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t };
  town.edges = town.edges.filter(x => x !== e);
  town.edges.push({ id: uid(), a: e.a, b: nid, name: e.name, path: e.path }, { id: uid(), a: nid, b: e.b, name: e.name, path: e.path });
  return nid;
}
export function findPlot(town, type, { near, edges, random } = {}) {
  const T = TYPES[type], off = T.d / 2 + 2.8, cands = [];
  for (const e of (edges || town.edges)) {
    if (e.path) continue;
    const A = town.nodes[e.a], B = town.nodes[e.b], L = Math.hypot(B.x - A.x, B.z - A.z);
    const ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
    for (let s = 2; s < L - 2; s += 1.5) {
      for (const side of [-1, 1]) {
        const rx = A.x + ux * s, rz = A.z + uz * s;
        const x = rx - uz * off * side, z = rz + ux * off * side;
        if (Math.hypot(x, z) > 200) continue;
        const rot = Math.atan2(rx - x, rz - z);
        if (fits(town, x, z, T.w, T.d, rot)) cands.push({ x, z, rot });
      }
    }
  }
  if (!cands.length) return null;
  if (near) cands.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
  return random ? pick(cands) : cands[0];
}

/* ---------- the starting village ---------- */
export function initialTown() {
  const town = { ver: 1, nodes: {}, edges: [], places: [], things: [], R: 40, grown: 0, usedNames: [] };
  const N = { A: [-34, 0], B: [-17, 1], C: [0, 0], D: [17, -1], E: [34, 1], F: [-1, -15], G: [-3, -32], H: [1, 15], I: [-7, 31], J: [19, 16], K: [26, 31], L: [-24, -15], M: [-33, -28], O1: [15, -18], O: [30, -25] };
  for (const k in N) town.nodes[k] = { x: N[k][0], z: N[k][1] };
  const E = [['A', 'B', 'High Street'], ['B', 'C', 'High Street'], ['C', 'D', 'High Street'], ['D', 'E', 'High Street'], ['C', 'F', 'Church Lane'], ['F', 'G', 'Church Lane'], ['C', 'H', 'Pond Lane'], ['H', 'I', 'Pond Lane'], ['D', 'J', 'Mill Lane'], ['J', 'K', 'Mill Lane'], ['B', 'L', 'Hill Path'], ['L', 'M', 'Hill Path'], ['F', 'O1', 'Station Road'], ['O1', 'O', 'Station Road']];
  for (const [a, b, name] of E) town.edges.push({ id: a + b, a, b, name });
  const edge = id => town.edges.filter(e => e.id === id);
  const put = (type, name, near, edgeIds, desc) => {
    const spot = findPlot(town, type, { near, edges: edgeIds.flatMap(edge) });
    if (spot) return addPlace(town, { type, name, desc, x: spot.x, z: spot.z, rot: spot.rot, seed: Math.floor(r() * 1e9) });
  };
  const r = rng(1234);
  put('green', 'the village green', { x: 10, z: 10 }, ['CH', 'DJ', 'CD']);
  put('home', 'Percy\'s cottage', { x: -9, z: 22 }, ['HI']);
  put('bakery', 'Crumb\'s Bakery', { x: 8, z: -5 }, ['CD']);
  put('market', 'the market stall', { x: -5, z: 4 }, ['BC']);
  put('library', 'the library', { x: -9, z: -7 }, ['BC', 'CF']);
  put('cafe', 'The Copper Kettle', { x: -10, z: 6 }, ['BC']);
  put('post', 'the post office', { x: 25, z: -5 }, ['DE']);
  put('station', 'Mossbrook Station', { x: 24, z: -27 }, ['O1O']);
  put('tower', 'the clock tower', { x: -6, z: -22 }, ['FG']);
  put('stone', 'the Humming Stone', { x: 4, z: -27 }, ['FG']);
  put('lookout', 'the lookout hill', { x: -33, z: -16 }, ['LM']);
  for (let i = 0; i < 9; i++) {
    const e = town.edges[Math.floor(r() * town.edges.length)];
    const spot = findPlot(town, 'house', { edges: [e], near: { x: (town.nodes[e.a].x + town.nodes[e.b].x) / 2 + (r() - 0.5) * 10, z: (town.nodes[e.a].z + town.nodes[e.b].z) / 2 + (r() - 0.5) * 10 } });
    if (spot) addPlace(town, { type: 'house', name: 'a house on ' + e.name, x: spot.x, z: spot.z, rot: spot.rot, seed: Math.floor(r() * 1e9) });
  }
  updateR(town);
  return town;
}

/* ---------- finding the way ---------- */
export const endNodes = town => {
  const deg = {}; for (const e of town.edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
  return Object.keys(town.nodes).filter(id => deg[id] === 1 && !town.edges.some(e => e.path && (e.a === id || e.b === id)));
};
function dijkstra(town, start) {
  const dist = { [start]: 0 }, prev = {}, todo = new Set(Object.keys(town.nodes));
  while (todo.size) {
    let u = null, ud = Infinity; for (const n of todo) { const d = dist[n] ?? Infinity; if (d < ud) { ud = d; u = n; } }
    if (u === null) break; todo.delete(u);
    for (const e of town.edges) {
      const v = e.a === u ? e.b : e.b === u ? e.a : null; if (!v || !todo.has(v)) continue;
      const A = town.nodes[u], B = town.nodes[v], nd = ud + Math.hypot(A.x - B.x, A.z - B.z);
      if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; }
    }
  }
  return { dist, prev };
}
// A list of points to walk through: along the roads from where he is to where he's going.
export function route(town, from, to) {
  const P1 = nearestRoad(town, from.x, from.z), P2 = nearestRoad(town, to.x, to.z);
  const pts = [];
  if (P1.d > 0.6) pts.push({ x: P1.x, z: P1.z });
  if (P1.edge === P2.edge) { pts.push({ x: P2.x, z: P2.z }); }
  else {
    let best = null;
    for (const a of [P1.edge.a, P1.edge.b]) {
      const { dist, prev } = dijkstra(town, a);
      for (const b of [P2.edge.a, P2.edge.b]) {
        if (dist[b] == null) continue;
        const NA = town.nodes[a], NB = town.nodes[b];
        const total = Math.hypot(P1.x - NA.x, P1.z - NA.z) + dist[b] + Math.hypot(P2.x - NB.x, P2.z - NB.z);
        if (!best || total < best.total) { const chain = [b]; let c = b; while (c !== a) { c = prev[c]; chain.unshift(c); } best = { total, chain }; }
      }
    }
    if (best) for (const id of best.chain) pts.push({ x: town.nodes[id].x, z: town.nodes[id].z });
    pts.push({ x: P2.x, z: P2.z });
  }
  if (Math.hypot(P2.x - to.x, P2.z - to.z) > 0.3) pts.push({ x: to.x, z: to.z });
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.05);
}
export function roadNameAt(town, x, z) { const n = nearestRoad(town, x, z); return n && n.d < 5 ? n.edge.name : null; }

/* ---------- growth: the fog pulls back ---------- */
function freshName(town, list) { const opts = list.filter(n => !town.usedNames.includes(n)); const n = opts.length ? pick(opts) : pick(list); town.usedNames.push(n); return n; }
export function grow(town, { day = 1, type } = {}) {
  const ends = endNodes(town);
  let from, dir, name;
  if (ends.length && Math.random() < 0.7) {
    from = pick(ends); const n = town.nodes[from];
    const e = town.edges.find(x => x.a === from || x.b === from); name = e.name;
    const other = town.nodes[e.a === from ? e.b : e.a]; const L = Math.hypot(n.x - other.x, n.z - other.z) || 1;
    dir = Math.atan2((n.x - other.x) / L, (n.z - other.z) / L) + (Math.random() - 0.5) * 0.7;
  } else {
    const ids = Object.keys(town.nodes).filter(id => !id.startsWith('p'));
    from = pick(ids); const n = town.nodes[from]; name = freshName(town, ROAD_NAMES);
    dir = Math.atan2(n.x || 1, n.z || 1) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6);
  }
  const n = town.nodes[from], len = 15 + Math.random() * 5;
  const nid = 'g' + uid(); town.nodes[nid] = { x: n.x + Math.sin(dir) * len, z: n.z + Math.cos(dir) * len };
  const edge = { id: uid(), a: from, b: nid, name }; town.edges.push(edge);
  town.grown++;
  const t = type || pick(['house', 'house', 'shop', 'shop', 'workshop', 'garden', 'museum', 'hall', 'tower', 'cafe']);
  const spot = findPlot(town, t, { edges: [edge], random: true });
  let place = null;
  if (spot) place = addPlace(town, { type: t, name: t === 'house' ? 'a house on ' + name : freshName(town, PLACE_NAMES[t] || ['somewhere new']), x: spot.x, z: spot.z, rot: spot.rot, known: false, builtBy: 'growth', day });
  updateR(town); town.ver++;
  return { edge, place, road: name };
}
