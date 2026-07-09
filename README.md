# LPS — Loot Priority Score

A read-only website for fairly distributing loot via loot council. It pulls your guild's data
from [wowaudit](https://wowaudit.com) (droptimizer wishlists, loot history, attendance) plus
gear/enchant state from Raider.IO, and ranks candidates for every drop with the LPS formula:

```
LPS = ((ΔI × 0.2) + (S × 5) + (E × 2.5)) / (1 + L) × A
```

| Variable | Meaning                                            | Source                          |
| -------- | -------------------------------------------------- | ------------------------------- |
| ΔI       | Item level difference vs. the equipped item        | Raider.IO gear (editable)       |
| S        | Droptimizer sim upgrade % (0 for tanks/healers)    | wowaudit wishlists              |
| E        | Enchant/gem investment score 0–10                  | Raider.IO gear (overridable)    |
| L        | Items received in the last 14/21 days              | wowaudit loot history           |
| A        | Activity multiplier (regular 1.0 / casual 0.7)     | wowaudit attendance (overridable) |

All weights and thresholds are configurable in the ⚙ settings drawer (persisted in your
browser). The full ruleset, including tier-set and hard-reserve exceptions, lives on the
**Rules** page.

Built with Angular 22 (zoneless, signals, control flow) and NgRx Signal Store. The site is
fully static — the wowaudit API key never reaches the browser. Data is fetched by a script
into `public/data/*.json`, either locally or by a scheduled GitHub Action.

## Local development

```bash
npm install
npm start            # http://localhost:4200 with the committed sample data
```

To see your own guild instead of the sample data:

```bash
cp .env.example .env # put your wowaudit API key inside (Team Settings → API)
npm run fetch-data   # writes public/data/*.json
npm start
```

`npm test` runs the unit tests (the LPS engine is covered, including the worked examples from
the rules). `npm run sample-data` regenerates the deterministic demo dataset.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Repository **Settings → Pages → Build and deployment → Source**: select **GitHub Actions**.
3. Push to `main` (or run the *Deploy to GitHub Pages* workflow manually). The site is served
   at `https://<user>.github.io/<repo>/`.

### Automatic data refresh

Add your key as a repository secret named `WOWAUDIT_API_KEY`
(**Settings → Secrets and variables → Actions**). The *Refresh guild data* workflow then runs
daily (plus extra runs on raid evenings — adjust the cron in
`.github/workflows/refresh-data.yml`), commits the new snapshot, and redeploys the site. You
can also trigger it manually from the Actions tab right after a raid.

## Project layout

- `scripts/fetch-data.mjs` — pulls wowaudit v1 API + Raider.IO gear → `public/data/*.json`
- `scripts/generate-sample-data.mjs` — deterministic demo dataset
- `src/app/core/lps.ts` — the LPS formula and gear-derived scores (pure functions)
- `src/app/store/` — NgRx Signal Stores: guild data + council settings
- `src/app/features/` — Standings, Loot Council, History, Rules pages
