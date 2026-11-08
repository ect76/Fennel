export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const uid = () => Math.random().toString(36).slice(2, 10);
// Claude sometimes wraps words in an object ({"text": "..."}) or a list; always get the words out
export function plain(v, depth = 0) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (depth > 3) return '';
  if (Array.isArray(v)) return v.map(x => plain(x, depth + 1)).filter(Boolean).join(' ');
  if (typeof v === 'object') { for (const k of ['text', 'thought', 'content', 'words', 'value', 'message', 'diary']) if (k in v) return plain(v[k], depth + 1); const first = Object.values(v).find(x => typeof x === 'string'); return first || ''; }
  return '';
}
export const str = (v, n) => plain(v).replace(/\s+/g, ' ').trim().slice(0, n);
export const plainName = n => String(n).replace(/^(a|an|the)\s+/i, '').trim() || 'thing';
export function rng(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
