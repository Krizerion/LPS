# LPS — Loot Priority Score

A read-only website for fairly distributing loot via loot council. It pulls your guild's data
from [wowaudit](https://wowaudit.com) (droptimizer wishlists, loot history, attendance) plus
gear/enchant state from Raider.IO, and ranks candidates for every drop with the LPS formula:

```
LPS = ((ΔI × 0.2) + (S × 5)) / (1 + L) × A × F
```

| Variable | Meaning                                                            | Source                    |
| -------- | ------------------------------------------------------------------ | ------------------------- |
| ΔI       | Item level difference vs. the equipped item                        | Raider.IO gear (editable) |
| S        | Droptimizer sim upgrade %; 0 for tanks/healers or stale sims (>14d)| wowaudit wishlists        |
| L        | Items received in the last 14/21 days                              | wowaudit loot history     |
| A        | Activity multiplier (Редовен 1.0 / Нередовен 0.75)                 | loot-council decision     |
| F        | M+ effort factor 0.70–1.00: keys ≥10 over the last 2 resets, 8 = max | wowaudit historical data |

Effort *modulates* need instead of replacing it: nobody wins an item they don't need by
farming keys, but between comparable upgrades the invested player wins. Enchants and gems
are deliberately not scored — being fully enchanted is assumed.

The UI is bilingual (Bulgarian default, EN toggle in the top bar). All weights are
configurable in the ⚙ settings drawer (persisted in your browser). The full ruleset,
including tier-set and hard-reserve exceptions, lives on the **Rules** page.

**Player status (A) is a manual council decision** — wowaudit attendance is shown for
information only. Set statuses for everyone by editing
[`public/data/overrides.json`](public/data/overrides.json) and committing (e.g.
`"activity": { "Somechar": "casual" }`); clicking a status badge on Standings toggles it
in your own browser only. The same file can pin enchant scores. `fetch-data` never touches it.

Built with Angular 22 (zoneless, signals, control flow) and NgRx Signal Store. The site is
fully static — the wowaudit API key never reaches the browser. Data is fetched by a script
into `public/data/*.json`, either locally or by a scheduled GitHub Action.

## Local development

```bash
npm install
npm start            # http://localhost:4200 with the committed data snapshot
```

To pull a fresh snapshot from wowaudit:

```bash
cp .env.example .env # put your wowaudit API key inside (Team Settings → API)
npm run fetch-data   # writes public/data/*.json
npm start
```

`npm test` runs the unit tests (the LPS engine is covered, including the worked examples from
the rules).

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Repository **Settings → Pages → Build and deployment → Source**: select **GitHub Actions**.
3. Push to `main` (or run the *Deploy to GitHub Pages* workflow manually). The site is served
   at `https://<user>.github.io/<repo>/`.

### Manual refresh button (⟳ in the top bar)

To pull fresh wowaudit data on demand (e.g. right after someone uploads a droptimizer):
create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
scoped to this repository only, with **Actions: Read and write** permission, and paste it in
⚙ → *Manual data refresh (GitHub)*. The token is stored only in that browser. The ⟳ button
then dispatches the refresh workflow and reloads the page data automatically once the new
snapshot is deployed (~2–3 minutes).

### Automatic data refresh

Add your key as a repository secret named `WOWAUDIT_API_KEY`
(**Settings → Secrets and variables → Actions**). The *Refresh guild data* workflow then runs
daily (plus extra runs on raid evenings — adjust the cron in
`.github/workflows/refresh-data.yml`), commits the new snapshot, and redeploys the site. You
can also trigger it manually from the Actions tab right after a raid.

## Project layout

- `scripts/fetch-data.mjs` — pulls wowaudit v1 API + Raider.IO gear → `public/data/*.json`
- `src/app/core/lps.ts` — the LPS formula and gear-derived scores (pure functions)
- `src/app/store/` — NgRx Signal Stores: guild data + council settings
- `src/app/features/` — Standings, Loot Council, History, Rules pages
