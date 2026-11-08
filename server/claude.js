// A tiny Claude API client using Node's built-in fetch (no packages needed).
import { config } from './config.js';

export const usage = { day: '', calls: 0, searches: 0, inputTokens: 0, outputTokens: 0, errors: 0, lastError: '' };
// Some models won't accept being made to use a particular tool. Once a model says so, it's asked nicely instead.
const noForce = new Set();

function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (usage.day !== d) Object.assign(usage, { day: d, calls: 0, searches: 0, inputTokens: 0, outputTokens: 0 });
}
export function canCall() { rollDay(); return !!config.apiKey && usage.calls < config.maxCallsPerDay; }
export function canSearch() { rollDay(); return config.webResearch && usage.searches < config.maxSearchesPerDay; }

// json: true makes Claude answer by filling in a 'respond' tool, which always comes back as readable data.
export async function callClaude({ model, system, prompt, maxTokens = 800, webSearches = 0, timeoutMs = 120000, images = [], json = false }) {
  rollDay();
  if (!canCall()) throw new Error('daily limit reached');
  usage.calls++;
  // images: [{ mediaType: 'image/png', data: '<base64>' }] are shown to Claude alongside the prompt
  const content0 = images.length ? [...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })), { type: 'text', text: prompt }] : prompt;
  const messages = [{ role: 'user', content: content0 }];
  const tools = [];
  if (webSearches > 0) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: webSearches });
  if (json) tools.push({ name: 'respond', description: 'Give your final answer by calling this tool, with exactly the JSON object the prompt asks for as its input.', input_schema: { type: 'object', additionalProperties: true } });
  let toolChoice = json && !noForce.has(model) ? (webSearches > 0 ? { type: 'any' } : { type: 'tool', name: 'respond' }) : null;
  const content = [];
  for (let round = 0; round < 4; round++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res, data;
    try {
      res = await fetch(config.apiBase + '/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': process.env.ANTHROPIC_VERSION || '2026-10-21' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, ...(tools.length ? { tools } : {}), ...(toolChoice ? { tool_choice: toolChoice } : {}) }),
      });
      data = await res.json().catch(() => null);
    } catch (e) {
      usage.errors++; usage.lastError = e.name === 'AbortError' ? 'timed out' : String(e.message || e);
      throw new Error(usage.lastError);
    } finally { clearTimeout(timer); }
    if (!res.ok && toolChoice && data && data.error && /tool_choice/i.test(data.error.message || '')) {
      noForce.add(model); toolChoice = null; round--; // try again, letting the model choose to use the tool
      console.log('[percy] ' + model + ' won\'t be made to use a tool; asking it nicely instead');
      continue;
    }
    if (!res.ok || !data) {
      usage.errors++;
      usage.lastError = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      throw new Error(usage.lastError);
    }
    const u = data.usage || {};
    usage.inputTokens += u.input_tokens || 0;
    usage.outputTokens += u.output_tokens || 0;
    usage.searches += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
    content.push(...(data.content || []));
    if (data.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: data.content }); continue; }
    break;
  }
  const text = content.filter(b => b.type === 'text').map(b => b.text).join('');
  const call = content.find(b => b.type === 'tool_use' && b.name === 'respond');
  const data = call && call.input && typeof call.input === 'object' ? call.input : null;
  const sources = [];
  for (const b of content) {
    if (b.type === 'text' && Array.isArray(b.citations)) {
      for (const c of b.citations) if (c.url && !sources.some(s => s.url === c.url)) sources.push({ url: c.url, title: c.title || c.url });
    }
  }
  return { text, sources, data };
}

// Pull one JSON object out of a reply, tolerating a sentence before or after it.
export function parseJSON(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const raw = body.slice(a, b + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\u201c\u201d]/g, '"').replace(/,\s*([}\]])/g, '$1').replace(/\n/g, ' ')); } catch { return null; }
}
