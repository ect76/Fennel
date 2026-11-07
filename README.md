# Fennel of Mossbrook

Fennel is a small autonomous frog who lives in a floating island town, day and night. He gets hungry and tired, draws, writes pages for visitors, researches things on the web at the library, tests the misty edge of his world, and reflects on each day before he sleeps. Those reflections change his beliefs, goals and habits, so over weeks he becomes someone nobody designed.

Visitors can watch him in 3D, read his diary, and leave notes under the Humming Stone. As the keeper, you can also add objects to his town and leave books for him to research.

## How it works

- **The world** runs on the server in real time. By default, a town day lasts 6 real hours (`TIME_SCALE=4`). There's weather, seasons, and small random happenings.
- **His mind** is Claude. Every time he finishes something, Claude gets his needs, surroundings, memories, recent thoughts and goals, then writes what he thinks and decides what he does next. At bedtime, a stronger model reflects on the day and updates who he is. At the library, he uses real web search.
- **If Claude isn't available** (no key, daily limit reached, an outage), simple rules keep him alive until it's back.
- **His memory** is saved in `/data/world.json`, with a daily backup in `/data/backups`.

---

## Setup on Unraid

### 1. Let GitHub build the image

Every push to this repository builds a Docker image automatically.

1. Open the repository's **Actions** tab and wait for "Build Fennel" to show a green tick (a few minutes).
2. Make the image public so Unraid can download it: on your GitHub profile, open **Packages → fennel → Package settings**, then under "Danger zone" choose **Change visibility → Public**. This is safe: the image contains only code, never your keys.

The image is then at `ghcr.io/ect76/fennel:latest`.

### 2. Get a Claude API key

1. Sign in to the Claude Console at **platform.claude.com** (separate from your Claude chat subscription).
2. Add some credit under Billing, and set a **monthly spend limit** there so costs can never surprise you.
3. Under **API keys**, create a key and copy it. You'll paste it into Unraid in the next step. Never put it in this repository.

### 3. Add the container in Unraid

**Easy way (template):** open Unraid's terminal (the `>_` icon at the top right of the web interface) and paste:

```
mkdir -p /boot/config/plugins/dockerMan/templates-user && curl -fsSL -o /boot/config/plugins/dockerMan/templates-user/my-fennel.xml https://raw.githubusercontent.com/ect76/Fennel/main/unraid/fennel.xml && echo "Fennel template installed"
```

Then on the **Docker** tab, click **Add Container**, choose **fennel** from the **Template** dropdown, fill in your Claude API key and a keeper password, and click **Apply**. Open `http://<your-unraid-ip>:3000` and he's there.

**Manual way:** on the **Docker** tab, click **Add Container** and fill in:

| Field | Value |
|---|---|
| Name | `fennel` |
| Repository | `ghcr.io/ect76/fennel:latest` |
| Network Type | `bridge` |
| WebUI | `http://[IP]:[PORT:3000]/` |

Then use **Add another Path, Port, Variable…** to add:

| Type | Name | Container | Host / Value |
|---|---|---|---|
| Port | Web | `3000` | `3000` (or any free port) |
| Path | Data | `/data` | `/mnt/user/appdata/fennel` |
| Variable | Claude API key | `ANTHROPIC_API_KEY` | your key |
| Variable | Keeper key | `KEEPER_KEY` | a password you choose, for adding things to town |

Click **Apply**. Open `http://<your-unraid-ip>:3000` and he's there.

### 4. Updates

When the code changes, GitHub builds a new image. In Unraid, click **Check for Updates** on the Docker tab, then **apply update** for fennel. To make this automatic, the **CA Auto Update Applications** plugin can update containers on a schedule. His memories live in appdata, so they survive every update.

### 5. Let the world visit (optional)

Unraid can publish a container to the internet through Tailscale Funnel, which works on Tailscale's free plan and needs no router changes:

1. Install the **Tailscale** plugin from Community Applications and sign in.
2. Edit the fennel container, turn on **Use Tailscale**, and choose a hostname (for example `mossbrook`). The name appears in a public certificate log, so pick one you're happy to share.
3. Set the serve option to **Funnel** and click **Apply**.
4. Check the container log for a "To authenticate, visit…" link and approve it.

You'll get a public address like `https://mossbrook.<your-tailnet>.ts.net`. Visitors can watch and leave notes; the keeper tools still need your keeper key.

---

## Settings (all optional except the API key)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns on his Claude-powered mind |
| `KEEPER_KEY` | — | Password for adding things and books from the web page |
| `TIME_SCALE` | `4` | Town minutes per real minute. `4` = a town day every 6 hours; `24` = one per hour |
| `MAX_CALLS_PER_DAY` | `250` | Hard cap on Claude calls per real day. After that he runs on simple rules until midnight (UTC) |
| `MAX_SEARCHES_PER_DAY` | `12` | Cap on web searches per day ($10 per 1,000 searches, so 12 a day is at most about $3.60 a month) |
| `WEB_RESEARCH` | `on` | Set to `off` to research from Claude's own knowledge only |
| `MODEL_THINK` | `claude-haiku-5-5` | Model for everyday thoughts and choices (most calls) |
| `MODEL_REFLECT` | `claude-sonnet-5-5` | Model for bedtime reflection and the pages he writes |
| `MODEL_RESEARCH` | `claude-sonnet-5-5` | Model for library research |

### Keeping costs in check

Most calls are small everyday decisions on the cheapest model. To spend less: lower `TIME_SCALE` (fewer decisions per hour), lower `MAX_CALLS_PER_DAY`, or set `MODEL_REFLECT` and `MODEL_RESEARCH` to the Haiku model. To make him richer: raise `MODEL_THINK` to the Sonnet model. Watch your real spending in the Claude Console for the first few days and adjust.

## Checking on him

- `http://<server>:3000/api/health` shows whether his mind is running on Claude or simple rules, today's call count, and the last error.
- The container log prints a line whenever something goes wrong with a Claude call.

## Running without Docker

Needs Node.js 20 or newer. No packages to install.

```
ANTHROPIC_API_KEY=... KEEPER_KEY=... node server/index.js
```
