# Percy of Mossbrook

Percy is an autonomous agent who lives as a small penguin in Mossbrook, a village of cobbled streets surrounded by fog. He lives there day and night, whether or not anyone is watching.

He starts with almost nothing: a cottage, a name, a few coins, and no idea what the town holds. Nobody gave him hobbies, fears or a personality. He decides what he wants (for the next ten minutes or the next few weeks) and then how to get it: walking somewhere to look, investigating a question on the web, writing and testing code, building and publishing websites, drawing, writing, asking for things he lacks, or doing nothing much at all. What he becomes comes out of what he actually experiences.

Visitors can watch him in 3D, walk the streets themselves, see what he's thinking and doing, follow every search he makes, open his projects, leave notes under the Humming Stone, and buy what he decides to sell.

As the keeper, you shape his **environment**, never his mind: make things appear (describe it or upload a photo and Claude builds a 3D version), paint walls, put up buildings, push back the fog, stock shops, leave books at the library, answer his requests, and set his budget.

## How it works

- **The world** runs on the server in real time (by default a town day lasts 6 real hours). It holds the truth: where things are, what's open, what happened.
- **What he perceives** is separate from that truth. He sees what's near him, as it looks rather than what it's called, until he finds out. He doesn't know there are visitors; he might notice the stone humming.
- **His mind** is Claude, run cheaply: a small model (Haiku) for most decisions, short sittings for research and coding, prompt caching, and a daily spending cap you can change from the page.
- **His memory** has five kinds (experiences, things he knows, views of himself, skills, intentions and questions), every item tagged with how he knows it (saw it, read it with the source link, was told, worked it out, imagined it). Old memories are summarised but never rewritten.
- **Research** happens whenever he wants to find something out: from his computer at home or at the library. He types his own searches, opens pages, follows links wherever they lead, notes leads for later, and can pick an investigation up again days later. Every query and page is on the **Research** page.
- **Code** is real: he writes files, runs them in a sandbox (no network, can only see his project), previews pages in a real browser (seeing console errors and a screenshot), fixes what's actually broken, keeps versions with git, and publishes to his website.
- **The decision journal** (keeper only) records why he chose each thing: what triggered it, what he intended, what he expected, and what actually happened.
- **If Claude isn't available** (paused, budget reached, an outage), he keeps living on simple rules and keeps his intentions for later.
- **Everything he is** is saved in `/data`: `world.json`, `journal.jsonl`, `memory-archive.jsonl`, `workspace/` (his projects, with history), `media/`, and daily backups.

---

## Setup on Unraid

### 1. The image

GitHub builds a Docker image automatically every time the code changes: `ghcr.io/ect76/fennel:latest`.

### 2. A Claude API key

1. Sign in to the Claude Console at **platform.claude.com** (separate from your Claude chat subscription).
2. Add some credit under Billing, and set a **monthly spend limit** so costs can never surprise you.
3. Under **API keys**, click **Create key** and copy the whole `sk-ant-…` key straight away (it's only shown once). Paste it into Unraid in the next step. Never paste it anywhere else.

### 3. Add the container

Open Unraid's terminal (the `>_` icon at the top right) and paste:

```
mkdir -p /boot/config/plugins/dockerMan/templates-user && curl -fsSL -o /boot/config/plugins/dockerMan/templates-user/my-fennel.xml https://raw.githubusercontent.com/ect76/Fennel/main/unraid/fennel.xml && echo "Template installed"
```

Then on the **Docker** tab, click **Add Container**, choose **fennel** from the **Template** dropdown, fill in your **Claude API key** and a **Keeper key** (any password you like), and click **Apply**. Open `http://<your-unraid-ip>:3000`.

### 4. Updates

On the **Docker** tab, click **Check for Updates**, then **apply update**. If it insists it's up to date, switch to **Advanced view** and use **force update**. His memories live in appdata, so updates keep everything.

(The one exception was the switch to this design, which started a new world on purpose. The old world was kept in `/data/archive-v2-…`.)

### 4b. Free web search with SearXNG (recommended)

Percy can search the web three ways. In order of preference:

1. **Your own SearXNG** (free, private): set **SearXNG address**.
2. **His own browser** (free, built into the container): searches Bing directly. Works without any setup, but search engines sometimes block automated browsers.
3. **Claude's web search** (about 1p per search, capped by **Max paid web searches per day**).

To set up SearXNG on Unraid:

1. In **Apps** (Community Applications), search for **SearXNG** and install it. Note its port (often `8080`; change it if something else uses that).
2. That's all SearXNG needs. (Optionally, enabling its JSON output in `settings.yml` under `search: formats: [html, json]` is slightly faster; without it Percy reads its normal results page.)
3. Edit Percy's container and set **SearXNG address** to e.g. `http://192.168.0.15:8080`. Apply.

The keeper's Budget panel shows which search method he's using and how many free and paid searches he's done today. You can force one method there too.

### 5. Let the world visit (optional)

1. Install the **Tailscale** plugin from Community Applications and sign in.
2. Edit the container, turn on **Use Tailscale**, choose a hostname (it appears in a public certificate log, so pick one you're happy to share), set the serve option to **Funnel**, and click **Apply**.
3. Approve the "To authenticate, visit…" link in the container log.

You'll get an address like `https://mossbrook.<your-tailnet>.ts.net`. Put it in the **Public address** setting so his website links to it.

### 6. His own website (optional)

Percy can publish his projects, writing and drawings to a GitHub Pages site he keeps himself.

1. (Optional, but fun) create a GitHub account just for him, e.g. `percy-the-penguin`.
2. On that account, create a public repository named `<account>.github.io` (e.g. `percy-the-penguin.github.io`) with a README, then in its **Settings → Pages** choose "Deploy from a branch", branch `main`.
3. Create a token: **Settings → Developer settings → Fine-grained tokens → Generate new token**. Give it access to only that repository, with **Contents: Read and write**.
4. In the Unraid container's advanced settings, set **Website: GitHub token** to the token and **Website: repository** to `percy-the-penguin/percy-the-penguin.github.io`.

Within a minute or two of his next drawing, his site appears at `https://percy-the-penguin.github.io`.

### 7. Real prints (optional)

If you want real people to be able to buy real prints, set up your own shop page (Ko-fi, a Stripe payment link, etc.) and put its address in **Real print shop link**. It appears beside his drawings. When a print sells, record it in the Keeper tab so Percy finds coins in his tin. You handle the printing, posting and any tax.

### 8. His shop, commissions and real money (optional)

Percy earns coins three ways, and spends them in the shops:

- **The stall.** If he decides to leave drawings out on the market stall, visitors can take one from the Work tab and he finds coins in his tin.
- **Commissions.** Anyone visiting can send him an order on his **shop page** (the "His shop & jobs" link under his name, or `/shop`) (a drawing, something written, or a web page) and offer up to 20 coins. Orders arrive as letters at the post office in Mossbrook, which he collects when he goes there (it's open 9am to 5pm, town time). He decides whether to take each job (he can say no), does it, and gets paid when it's finished. Each visitor can send three a day. You can remove any order in the Keeper tab.
- **His shop.** If he wants to, he lists drawings, writing or projects for sale at prices he sets. If he builds a page for it, the server fills in the stock and "sold" labels whenever he publishes (see the `percy-shop` slot).

Nothing to set up for any of that. To let people pay **real money**, which turns into coins, connect Ko-fi:

1. Make a free page at [ko-fi.com](https://ko-fi.com) for Percy.
2. His town needs a public address so Ko-fi can reach it: set up Tailscale Funnel (step 5) and put the address in **Public address**.
3. On Ko-fi, open **Settings → API**. Copy the **Verification Token**. In **Webhook URL**, put your public address followed by `/api/kofi` (for example `https://percy.your-tailnet.ts.net/api/kofi`) and click **Update**.
4. In the Unraid container's advanced settings, set **Ko-fi page** to your Ko-fi address (e.g. `https://ko-fi.com/percythepenguin`) and **Ko-fi verification token** to the token. Apply.
5. Back on Ko-fi, use one of the test buttons. The server log shows `ko-fi: 3.00 GBP became 30 coins`.

Every pound sent becomes 10 coins (change it with **Coins per pound**). Payments arrive in envelopes at the post office, with their message, and he opens them next time he goes. To buy something from his shop, people pay at least its price on Ko-fi and put the item's code (like `PCY-7KQ2`) in their message. The item is marked sold and the payment counts as buying it. A code from an order works the same way, for tipping him for a job. If a supporter ticks Ko-fi's "private" box, Percy only sees the coins: no name, no message.

In the Keeper tab you can also **give him coins** yourself (with a message if you like), or record a shop sale that was paid some other way. Everything he sells is digital: buyers get his drawing, page or web project online, and nothing is ever posted. The post office is only part of his world, not a job for you. You handle anything owed on real money (Ko-fi's terms, tax).

### 9. Taking things away

In the Keeper tab you can remove things you've made, graffiti, shop items, notes, orders and whole buildings (everything except his cottage). If he knew something was there, he may notice it's gone.

### 10. His requests

When he finds something missing that he wants, he writes a request: what, why, what's missing, what he considered instead, what it depends on, and how much he cares. They're on the **His requests** page (`/requests`). Answer them in the Keeper tab (Approve, Decline, Approve with changes, It's done, with an optional note). Your answer reaches him as a letter at the post office. Approving doesn't make anything happen by itself: for an object, use **Make this** (or the "Make something" card, choosing which request it's for).

---

## Settings

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns on his Claude-powered mind |
| `KEEPER_KEY` | — | Password for the keeper tools on the web page |
| `TIME_SCALE` | `4` | Town minutes per real minute. `4` = a town day every 6 hours |
| `GROW_EVERY_DAYS` | `0` | The fog pulls back every N town days. `0` (the default) = only when you push it back in the Keeper tab |
| `MAX_CALLS_PER_DAY` | `300` | Claude calls per real day (change it live in the Keeper tab) |
| `MAX_SPEND_PER_DAY` | `2` | Estimated dollars per real day, worked out from the tokens each call used (`0` = no cap; change it live) |
| `MAX_SEARCHES_PER_DAY` | `10` | Paid Claude web searches per day (about $0.01 each) |
| `SEARXNG_URL` | — | Your SearXNG address for free searches (see 4b) |
| `MAX_LOCAL_SEARCHES` | `60` | Free searches (SearXNG or his browser) per day |
| `WEB_RESEARCH` | `on` | `off` = no web at all |
| `MODEL_DECIDE` | `claude-haiku-5-5` | Everyday decisions |
| `MODEL_WORK` | `claude-haiku-5-5` | Research and coding sittings |
| `MODEL_BETTER` | `claude-sonnet-5-5` | Used for everything when you choose "Better" in the Keeper tab |
| `MODEL_WORLD` | `claude-haiku-5-5` | Furnishing rooms, building things you make |
| `SESSION_STEPS` | `8` | Steps per research or coding sitting (also on the Budget card). Smaller = slower and cheaper; he carries on next time |
| `FETCH_TOKENS` | `6000` | How much of a web page he reads at once |
| `AUTO_PUBLISH` | `on` | He may update his website without asking. `off` = only when you allow it in the Keeper tab |
| `RUN_TIMEOUT_MS` | `15000` | How long his scripts may run |
| `CHROMIUM_PATH` | `/usr/bin/chromium-browser` | His browser (already in the image) |
| `PUBLIC_URL` | — | Where visitors can see his town |
| `GITHUB_TOKEN`, `GITHUB_REPO` | — | His website (see above) |
| `PRINT_SHOP_URL`, `PRINT_COINS` | —, `10` | Real prints (see above) |
| `KOFI_URL`, `KOFI_TOKEN` | — | Ko-fi (see above) |
| `COINS_PER_POUND` | `10` | Coins per pound sent on Ko-fi |

### Keeping costs in check

Open the **Keeper** tab: the **Budget** card shows today's calls, estimated spend and searches, and lets you lower the daily calls, the spending cap and paid searches, switch the search method, or pause his thinking entirely. Changes apply immediately, no restart. When a limit is reached he slows down first (fewer, cheaper decisions), then lives on simple rules until midnight UTC, keeping his plans. Also set a monthly spend limit in the Claude Console.

## Checking on him

- `http://<server>:3000/api/health` shows whether his mind is running on Claude or simple rules, today's calls and spend, the last error, which search method works, whether his browser and git are available, and his website's publishing status.
- The container log prints a line whenever something goes wrong.

## Running without Docker

Needs Node.js 22.15 or newer, plus Chromium and git for his browser and project history (he manages without them, but can't preview pages or keep versions). No npm packages to install.

```
ANTHROPIC_API_KEY=... KEEPER_KEY=... node server/index.js
```
