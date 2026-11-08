// Percy's own website. When GITHUB_TOKEN and GITHUB_REPO are set, he uploads what he makes
// (drawings, pages, graffiti) to a GitHub Pages repository, with an index page he signs himself.
import { config } from './config.js';

const queue = new Map(); // path -> { content, message }
export const pubStatus = { enabled: false, pushed: 0, lastPush: 0, lastError: '' };
export const enabled = () => !!(config.githubToken && config.githubRepo);
pubStatus.enabled = enabled();

export function queueFile(path, content, message) { if (enabled()) queue.set(path, { content, message }); }

async function putFile(path, content, message) {
  const url = `https://api.github.com/repos/${config.githubRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { authorization: 'Bearer ' + config.githubToken, accept: 'application/vnd.github+json', 'user-agent': 'percy-the-penguin', 'x-github-api-version': '2022-11-28' };
  let sha;
  const got = await fetch(url + '?ref=' + encodeURIComponent(config.githubBranch), { headers });
  if (got.ok) sha = (await got.json()).sha;
  const res = await fetch(url, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), branch: config.githubBranch, ...(sha ? { sha } : {}) }) });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error('GitHub said ' + res.status + ': ' + (j.message || 'unknown error')); }
}
let busy = false;
export async function flush() {
  if (busy || !enabled() || !queue.size) return;
  busy = true;
  try {
    for (const [path, item] of [...queue]) { await putFile(path, item.content, item.message); queue.delete(path); pubStatus.pushed++; }
    pubStatus.lastPush = Date.now(); pubStatus.lastError = '';
  } catch (e) { pubStatus.lastError = String(e.message || e); console.warn('[percy] publishing failed:', pubStatus.lastError); }
  finally { busy = false; }
}
setInterval(flush, 60000).unref();

/* ---------- the site itself ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'page';
const STYLE = `body{margin:0;background:#f4f1e8;color:#222;font:17px/1.55 Georgia,serif;padding:32px max(18px,env(safe-area-inset-left))}main{max-width:720px;margin:0 auto}h1{font-weight:normal;font-size:30px;margin:0 0 4px}h2{font-size:15px;font-weight:normal;text-transform:lowercase;letter-spacing:.06em;color:#777;margin:34px 0 10px}ul{padding-left:20px}a{color:#1f5f7a}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.grid figure{margin:0}.grid img{width:100%;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.15);background:#fff}.grid figcaption{font-size:14px;color:#555}.body{white-space:pre-line}footer{margin-top:44px;border-top:1px solid #ddd;padding-top:14px;color:#777;font-size:14px}`;
function footer() {
  const town = config.publicUrl ? `my town is at <a href="${esc(config.publicUrl)}">${esc(config.publicUrl.replace(/^https?:\/\//, ''))}</a>.` : 'my town is somewhere in the fog.';
  return `<footer>i am percy, a small autonomous penguin. i made this page myself. ${town}</footer>`;
}
const wrap = (title, inner, base = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${inner}${footer()}</main></body></html>`;

export function pageHTML(p) {
  return wrap(p.title, `<p><a href="../">← percy</a></p><h1>${esc(p.title)}</h1><p style="color:#777;font-size:14px">day ${p.day} in mossbrook</p><div class="body">${esc(p.body)}</div>`);
}
export function indexHTML(S) {
  const pages = S.pages.slice().reverse().map(p => `<li><a href="pages/${slug(p.title)}.html">${esc(p.title)}</a> <span style="color:#999">· day ${p.day}</span></li>`).join('');
  const drawings = S.drawings.slice().reverse().slice(0, 60).map(d => `<figure><img src="drawings/${d.id}.svg" alt="${esc(d.title)}" loading="lazy"><figcaption>${esc(d.title)} · day ${d.day}</figcaption></figure>`).join('');
  const graffiti = (S.graffiti || []).filter(g => g.by === 'percy').slice().reverse().slice(0, 30).map(g => `<figure><img src="graffiti/${g.id}.svg" alt="${esc(g.tag || 'graffiti')}" loading="lazy" style="background:#c9b9a6"><figcaption>${esc(g.where || '')} · day ${g.day}</figcaption></figure>`).join('');
  return wrap('percy', `<h1>percy</h1><p>things i am making.</p>
<h2>pages</h2>${pages ? '<ul>' + pages + '</ul>' : '<p>nothing yet.</p>'}
<h2>drawings</h2>${drawings ? '<div class="grid">' + drawings + '</div>' : '<p>nothing yet.</p>'}
<h2>things i put on walls. still up.</h2>${graffiti ? '<div class="grid">' + graffiti + '</div>' : '<p>nothing yet.</p>'}`);
}
