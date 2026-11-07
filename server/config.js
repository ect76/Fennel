// All settings come from environment variables (set them in Unraid's container settings).
const env = process.env;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export const config = {
  port: num(env.PORT, 3000),
  dataDir: env.DATA_DIR || './data',

  // Claude API
  apiKey: (env.ANTHROPIC_API_KEY || '').trim(),
  apiBase: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
  modelThink: env.MODEL_THINK || 'claude-haiku-5-5',      // moment-to-moment thoughts and choices
  modelReflect: env.MODEL_REFLECT || 'claude-sonnet-5-5', // nightly reflection, pages he writes
  modelResearch: env.MODEL_RESEARCH || 'claude-sonnet-5-5', // library research (with web search)

  // Pace and spending
  timeScale: num(env.TIME_SCALE, 4),               // town minutes per real minute (4 = a town day every 6 real hours)
  maxCallsPerDay: num(env.MAX_CALLS_PER_DAY, 250), // hard cap on Claude calls per real day
  maxSearchesPerDay: num(env.MAX_SEARCHES_PER_DAY, 12),
  webResearch: (env.WEB_RESEARCH || 'on').toLowerCase() !== 'off',

  // Password for adding things to town from the web page. Leave empty to turn those tools off.
  keeperKey: (env.KEEPER_KEY || '').trim(),
};
