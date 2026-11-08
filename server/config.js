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
  growEveryDays: Number.isFinite(Number(env.GROW_EVERY_DAYS)) && env.GROW_EVERY_DAYS !== undefined && env.GROW_EVERY_DAYS !== '' ? Math.max(0, Number(env.GROW_EVERY_DAYS)) : 3, // the fog pulls back every N town days (0 = only when the keeper says)
  webResearch: (env.WEB_RESEARCH || 'on').toLowerCase() !== 'off',

  // Percy's own website (optional): a GitHub repository with Pages turned on, and a token that can write to it
  githubToken: (env.GITHUB_TOKEN || '').trim(),
  githubRepo: (env.GITHUB_REPO || '').trim(),          // e.g. percy-the-penguin/percy-the-penguin.github.io
  githubBranch: (env.GITHUB_BRANCH || 'main').trim(),
  publicUrl: (env.PUBLIC_URL || '').trim(),            // where visitors can see his town, linked from his site

  // Optional real prints: a link to your own shop page (Ko-fi, Stripe payment link, etc.) shown beside his drawings
  printShopUrl: (env.PRINT_SHOP_URL || '').trim(),
  printCoins: num(env.PRINT_COINS, 10), // coins Percy finds in his tin when you record a real print sale

  // Real money through Ko-fi: tips and purchases turn into coins in Percy's shop inbox
  kofiUrl: (env.KOFI_URL || '').trim(),          // your Ko-fi page, e.g. https://ko-fi.com/percythepenguin
  kofiToken: (env.KOFI_TOKEN || '').trim(),      // the verification token from Ko-fi's webhook settings
  coinsPerPound: num(env.COINS_PER_POUND, 10),   // how many coins one pound (or dollar, euro...) becomes

  // Only used for testing: the town time a brand-new world starts at (minutes after midnight)
  startTime: Number.isFinite(Number(env.START_TIME)) && env.START_TIME ? Number(env.START_TIME) : 7 * 60,

  // Password for adding things to town from the web page. Leave empty to turn those tools off.
  keeperKey: (env.KEEPER_KEY || '').trim(),
};
