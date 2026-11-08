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
