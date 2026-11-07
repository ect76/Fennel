// A tiny Claude API client using Node's built-in fetch (no packages needed).
import { config } from './config.js';

export const usage = { day: '', calls: 0, searches: 0, inputTokens: 0, outputTokens: 0, errors: 0, lastError: '' };

function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (usage.day !== d) Object.assign(usage, { day: d, calls: 0, searches: 0, inputTokens: 0, outputTokens: 0 });
}
export function canCall() { rollDay(); return !!config.apiKey && usage.calls < config.maxCallsPerDay; }
export function canSearch() { rollDay(); return config.webResearch && usage.searches < config.maxSearchesPerDay; }

export async function callClaude({ model, system, prompt, maxTokens = 800, webSearches = 0, timeoutMs = 120000 }) {
  rollDay();
  if (!canCall()) throw new Error('daily limit reached');
  usage.calls++;
  const messages = [{ role: 'user', content: prompt }];
  const tools = webSearches > 0 ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: webSearches }] : null;
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
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, ...(tools ? { tools } : {}) }),
      });
      data = await res.json().catch(() => null);
    } catch (e) {
      usage.errors++; usage.lastError = e.name === 'AbortError' ? 'timed out' : String(e.message || e);
      throw new Error(usage.lastError);
    } finally { clearTimeout(timer); }
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
  const sources = [];
  for (const b of content) {
    if (b.type === 'text' && Array.isArray(b.citations)) {
      for (const c of b.citations) if (c.url && !sources.some(s => s.url === c.url)) sources.push({ url: c.url, title: c.title || c.url });
    }
  }
  return { text, sources };
}

// Pull one JSON object out of a reply, tolerating a sentence before or after it.
export function parseJSON(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(body.slice(a, b + 1)); } catch { return null; }
}
