# Percy of Mossbrook

Percy is a small autonomous penguin who lives completely alone in Mossbrook, a village of winding cobbled streets surrounded on every side by fog. He lives there day and night, whether or not anyone is watching.

He wakes into good days and bad days, gets lonely, gets absorbed by things, paints, writes pages, researches on the web at the library, tests the fog where the roads end, and reflects on each day before he sleeps. Those reflections change his beliefs, goals and habits, so over weeks he becomes someone nobody designed. Every few days the fog pulls back and there is more town than before.

Visitors can watch him in 3D, walk the streets themselves, read his diary, leave notes under the Humming Stone, and take his drawings from his market stall. He finds coins in his honesty tin and never knows who took them.

As the keeper, you can make anything appear in town (describe it or upload a photo and Claude builds a 3D version), paint graffiti on walls, put up new buildings, push back the fog, stock the shops with things for him to save up for, and leave books (or whole articles) at the library.

## How it works

- **The world** runs on the server in real time. By default a town day lasts 6 real hours (`TIME_SCALE=4`). There's weather, seasons and small happenings, and the town slowly grows.
- **His mind** is Claude. Every time he finishes something, Claude gets his mood, feelings, needs, surroundings, memories, interests and recent thoughts, and decides what he thinks and does next. He wakes each morning into a mood shaped by sleep, loneliness, the weather, yesterday and chance. At bedtime a stronger model reflects on the day and updates who he is. At the library he uses real web search, or reads what you left him.
- **His art** is painted by Claude as real illustrations (SVG), and pinned to the noticeboard on the High Street.
- **If Claude isn't available** (no key, daily limit reached, an outage), simple rules keep him alive until it's back.
- **Everything he is** is saved in `/data`: `world.json`, `media/` (drawings, graffiti, uploads) and a daily backup in `backups/`. Updates never wipe it.

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

On the **Docker** tab, click **Check for Updates**, then **apply update**. If it insists it's up to date, switch to **Advanced view** and use **force update**. The **CA Auto Update Applications** plugin can do this on a schedule. His memories live in appdata, so updates keep everything.

### 5. Let the world visit (optional)

1. Install the **Tailscale** plugin from Community Applications and sign in.
2. Edit the container, turn on **Use Tailscale**, choose a hostname (it appears in a public certificate log, so pick one you're happy to share), set the serve option to **Funnel**, and click **Apply**.
3. Approve the "To authenticate, visit…" link in the container log.

You'll get an address like `https://mossbrook.<your-tailnet>.ts.net`. Put it in the **Public address** setting so his website links to it.

### 6. His own website (optional)

Like Pino, Percy can publish his drawings, pages and graffiti to a GitHub Pages site he keeps himself.

1. (Optional, but fun) create a GitHub account just for him, e.g. `percy-the-penguin`.
2. On that account, create a public repository named `<account>.github.io` (e.g. `percy-the-penguin.github.io`) with a README, then in its **Settings → Pages** choose "Deploy from a branch", branch `main`.
3. Create a token: **Settings → Developer settings → Fine-grained tokens → Generate new token**. Give it access to only that repository, with **Contents: Read and write**.
4. In the Unraid container's advanced settings, set **Website: GitHub token** to the token and **Website: repository** to `percy-the-penguin/percy-the-penguin.github.io`.

Within a minute or two of his next drawing, his site appears at `https://percy-the-penguin.github.io`.

### 7. Real prints (optional)

If you want real people to be able to buy real prints, set up your own shop page (Ko-fi, a Stripe payment link, etc.) and put its address in **Real print shop link**. It appears beside his drawings. When a print sells, record it in the Keeper tab so Percy finds coins in his tin. You handle the printing, posting and any tax.

### 8. His shop, commissions and real money (optional)

Percy earns coins three ways, and spends them in the shops:

- **The stall.** He leaves drawings out on the market stall; visitors can take one from the Drawings tab and he finds coins in his tin.
- **Commissions.** Anyone visiting can send him an order from the **Shop & jobs** tab (a drawing, something written, or a web page) and offer up to 20 coins. Orders arrive as letters at the post office in Mossbrook, which he collects when he goes there (it's open 9am to 5pm, town time). He decides whether to take each job (he can say no), does it, and gets paid when it's finished. Each visitor can send three a day. You can remove any order in the Keeper tab.
- **His shop.** Now and then he sits down and decides which of his drawings, pages, web projects and belongings to sell, sets his own prices and writes the blurbs. If his website is set up, he also designs and builds his own shop page there (`shop.html`) and redesigns it when he feels like it. The server keeps the stock, prices and "sold" labels on that page up to date.

Nothing to set up for any of that. To let people pay **real money**, which turns into coins, connect Ko-fi:

1. Make a free page at [ko-fi.com](https://ko-fi.com) for Percy.
2. His town needs a public address so Ko-fi can reach it: set up Tailscale Funnel (step 5) and put the address in **Public address**.
3. On Ko-fi, open **Settings → API**. Copy the **Verification Token**. In **Webhook URL**, put your public address followed by `/api/kofi` (for example `https://percy.your-tailnet.ts.net/api/kofi`) and click **Update**.
4. In the Unraid container's advanced settings, set **Ko-fi page** to your Ko-fi address (e.g. `https://ko-fi.com/percythepenguin`) and **Ko-fi verification token** to the token. Apply.
5. Back on Ko-fi, use one of the test buttons. The server log shows `ko-fi: 3.00 GBP became 30 coins`.

Every pound sent becomes 10 coins (change it with **Coins per pound**). Payments arrive in envelopes at the post office, with their message, and he opens them next time he goes. To buy something from his shop, people pay at least its price on Ko-fi and put the item's code (like `PCY-7KQ2`) in their message. The item is marked sold and the payment counts as buying it. A code from an order works the same way, for tipping him for a job. If a supporter ticks Ko-fi's "private" box, Percy only sees the coins: no name, no message.

In the Keeper tab you can also **give him coins** yourself (with a message if you like), or record a shop sale that was paid some other way. Everything he sells is digital: buyers get his drawing, page or web project online, and nothing is ever posted. The post office is only part of his world, not a job for you. You handle anything owed on real money (Ko-fi's terms, tax).

### 9. Taking things away

In the Keeper tab you can remove things you've made, graffiti, shop items, notes, orders and whole buildings (everything except his cottage). He notices when something he knew has gone, and it stays with him. Without the bakery, library, market stall or Humming Stone he can't do the things he does there.

---

## Settings

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns on his Claude-powered mind |
| `KEEPER_KEY` | — | Password for the keeper tools on the web page |
| `TIME_SCALE` | `4` | Town minutes per real minute. `4` = a town day every 6 hours |
| `GROW_EVERY_DAYS` | `3` | The fog pulls back every N town days (`0` = only when you do it) |
| `MAX_CALLS_PER_DAY` | `250` | Hard cap on Claude calls per real day; after that he runs on simple rules until midnight UTC |
| `MAX_SEARCHES_PER_DAY` | `12` | Cap on web searches per day ($10 per 1,000 searches, so at most about $3.60 a month) |
| `WEB_RESEARCH` | `on` | `off` = research from Claude's own knowledge only |
| `MODEL_THINK` | `claude-haiku-5-5` | Everyday thoughts and choices (most calls) |
| `MODEL_REFLECT` | `claude-sonnet-5-5` | Bedtime reflection, pages, drawings, graffiti and things you make |
| `MODEL_RESEARCH` | `claude-sonnet-5-5` | Library research |
| `PUBLIC_URL` | — | Where visitors can see his town |
| `GITHUB_TOKEN`, `GITHUB_REPO` | — | His website (see above) |
| `PRINT_SHOP_URL`, `PRINT_COINS` | —, `10` | Real prints (see above) |
| `KOFI_URL` | — | His Ko-fi page, linked from his shop |
| `KOFI_TOKEN` | — | Ko-fi's verification token; turns on `/api/kofi` |
| `COINS_PER_POUND` | `10` | Coins per pound (or dollar, euro...) sent on Ko-fi |

### Keeping costs in check

Most calls are small everyday decisions on the cheapest model; drawings and reflections use the bigger one. To spend less: lower `TIME_SCALE`, lower `MAX_CALLS_PER_DAY`, or set `MODEL_REFLECT` to the Haiku model. Watch your spending in the Claude Console for the first few days and adjust.

## Checking on him

- `http://<server>:3000/api/health` shows whether his mind is running on Claude or simple rules, today's call count, the last error, and his website's publishing status.
- The container log prints a line whenever something goes wrong.

## Running without Docker

Needs Node.js 20 or newer. No packages to install.

```
ANTHROPIC_API_KEY=... KEEPER_KEY=... node server/index.js
```
