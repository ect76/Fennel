// All settings come from environment variables (set them in Unraid's container settings).
// Spending limits set on the page (Keeper → Budget) are saved with the world and take priority over these.
import fs from 'node:fs';
const env = process.env;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const numZ = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v))) ? d : Math.max(0, Number(v)); // allows 0
const onOff = (v, d) => v === undefined || v === '' ? d : !['off', 'false', '0', 'no'].includes(String(v).toLowerCase());
const firstExisting = list => list.find(p => { try { return p && fs.existsSync(p); } catch { return false; } }) || '';

export const config = {
  port: num(env.PORT, 3000),
  dataDir: env.DATA_DIR || './data',

  // Claude API
  apiKey: (env.ANTHROPIC_API_KEY || '').trim(),
  apiBase: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
  apiVersion: env.ANTHROPIC_VERSION || '2026-10-21',
  // Slow and cheap by default: Haiku for everything; the Keeper → Budget panel can switch his thinking to Sonnet
  modelDecide: env.MODEL_DECIDE || 'claude-haiku-5-5',                          // choosing what he wants and does next
  modelWork: env.MODEL_WORK || 'claude-haiku-5-5',                              // research, coding, writing, drawing, reflection
  modelBetter: env.MODEL_BETTER || 'claude-sonnet-5-5',                         // used when the keeper picks "better" thinking
  modelWorld: env.MODEL_WORLD || env.MODEL_THINK || 'claude-haiku-5-5',           // the world itself: building models, furnishing rooms

  // Pace and spending (defaults; the Keeper → Budget panel can change them live)
  timeScale: num(env.TIME_SCALE, 4),                   // town minutes per real minute (4 = a town day every 6 real hours)
  maxCallsPerDay: num(env.MAX_CALLS_PER_DAY, 300),     // Claude calls per real day
  maxSearchesPerDay: num(env.MAX_SEARCHES_PER_DAY, 10),// web searches per real day ($0.01 each)
  maxSpendPerDay: numZ(env.MAX_SPEND_PER_DAY, 2),      // estimated US dollars per real day (0 = no spending cap)
  sessionSteps: num(env.SESSION_STEPS, 8),             // steps per coding/research sitting: small sittings, carried on later
  fetchTokens: num(env.FETCH_TOKENS, 6000),            // how much of a web page he reads at once
  growEveryDays: numZ(env.GROW_EVERY_DAYS, 0),         // the fog pulls back every N town days (0 = only when the keeper says: the default)
  webResearch: onOff(env.WEB_RESEARCH, true),

  // Searching without paying per search: a SearXNG instance (e.g. http://192.168.0.15:8888, with json enabled)
  searxngUrl: (env.SEARXNG_URL || '').trim(),
  maxLocalSearches: num(env.MAX_LOCAL_SEARCHES, 60),   // free searches (SearXNG or his browser) per real day

  // His workshop: running code he writes, and a headless browser to look at his pages
  chromiumPath: env.CHROMIUM_PATH || firstExisting(['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']),
  runTimeoutMs: num(env.RUN_TIMEOUT_MS, 15000),

  // Percy's own website (optional): a GitHub repository with Pages turned on, and a token that can write to it
  githubToken: (env.GITHUB_TOKEN || '').trim(),
  githubRepo: (env.GITHUB_REPO || '').trim(),          // e.g. ect76/percy
  githubBranch: (env.GITHUB_BRANCH || 'main').trim(),
  autoPublish: onOff(env.AUTO_PUBLISH, true),          // he may update his own site without asking each time
  publicUrl: (env.PUBLIC_URL || '').trim(),            // where visitors can see his town, linked from his site

  // Optional real prints: a link to your own shop page shown beside his drawings
  printShopUrl: (env.PRINT_SHOP_URL || '').trim(),
  printCoins: num(env.PRINT_COINS, 10),

  // Real money through Ko-fi: tips and purchases turn into coins that arrive at the post office
  kofiUrl: (env.KOFI_URL || '').trim(),
  kofiToken: (env.KOFI_TOKEN || '').trim(),
  coinsPerPound: num(env.COINS_PER_POUND, 10),

  // Only used for testing: the town time a brand-new world starts at (minutes after midnight)
  startTime: Number.isFinite(Number(env.START_TIME)) && env.START_TIME ? Number(env.START_TIME) : 7 * 60,

  // Password for the keeper tools on the page. Leave empty to turn those tools off.
  keeperKey: (env.KEEPER_KEY || '').trim(),
};

// Rough prices (US dollars per million tokens) for the spending estimate. Override with PRICE_<MODEL>=in,out
export const PRICES = {
  'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5], 'claude-opus-5-5': [4, 20],
  'claude-fable-5-1': [10, 50], default: [2, 10],
};
for (const [k, v] of Object.entries(env)) if (k.startsWith('PRICE_')) { const [i, o] = String(v).split(',').map(Number); if (i >= 0 && o >= 0) PRICES[k.slice(6).toLowerCase().replace(/_/g, '-')] = [i, o]; }
export const SEARCH_PRICE = 0.01;
