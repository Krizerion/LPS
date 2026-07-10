#!/usr/bin/env node
/**
 * Pulls guild data from the wowaudit public API (plus per-character gear from
 * Raider.IO) and writes the JSON snapshots the site reads from public/data/.
 *
 * Usage:
 *   WOWAUDIT_API_KEY=xxxx node scripts/fetch-data.mjs
 *   node scripts/fetch-data.mjs --key xxxx
 *   (or put the key in .env — see .env.example)
 *
 * Optional env:
 *   ATTENDANCE_DAYS  How far back attendance statistics reach (default 60).
 *   SKIP_RAIDERIO    Set to "1" to skip gear enrichment from Raider.IO.
 */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const WOWAUDIT_BASE = 'https://wowaudit.com/v1';

// Load .env (KEY=VALUE lines) without adding a dependency.
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // no .env file — fine
}

const ATTENDANCE_DAYS = Number(process.env.ATTENDANCE_DAYS ?? 60);

const keyArg = process.argv.indexOf('--key');
const API_KEY = keyArg > -1 ? process.argv[keyArg + 1] : process.env.WOWAUDIT_API_KEY;
if (!API_KEY) {
  console.error('Missing API key. Set WOWAUDIT_API_KEY or pass --key <key>.');
  process.exit(1);
}

async function wowaudit(path) {
  const res = await fetch(`${WOWAUDIT_BASE}${path}`, {
    headers: { Authorization: API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`wowaudit GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function realmSlug(realm) {
  return realm
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/\s+/g, '-');
}

/** Raider.IO slot names used by the app (see SLOT_MAP in src/app/core/lps.ts). */
async function fetchGear(region, character) {
  const params = new URLSearchParams({
    region,
    realm: realmSlug(character.realm),
    name: character.name,
    fields: 'gear',
  });
  const res = await fetch(`https://raider.io/api/v1/characters/profile?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.gear?.items ?? {};
  const slots = {};
  for (const [slot, item] of Object.entries(items)) {
    if (!item || typeof item.item_level !== 'number') continue;
    slots[slot] = { ilvl: item.item_level };
  }
  return {
    ilvlEquipped: data.gear?.item_level_equipped ?? null,
    slots,
    updatedAt: data.last_crawled_at ?? null,
  };
}

/** Latest non-null timestamp from wowaudit's per-spec maps ({Havoc: "...", ...}). */
function latestTimestamp(...maps) {
  const values = maps.flatMap((m) => Object.values(m ?? {})).filter(Boolean);
  return values.length ? values.sort().at(-1) : null;
}

/**
 * The live /v1/wishlists shape is characters[].instances[].difficulties[].wishlist
 * (the docs show an extra wishlists[]/wishlist.wishlist nesting — support both).
 */
function flattenWishlists(raw, seasonInstances) {
  // Seed the instance/encounter index from season metadata so the Council page
  // lists every boss of the tier even before anyone uploads a droptimizer.
  const instancesById = new Map();
  for (const inst of seasonInstances) {
    instancesById.set(inst.id, {
      id: inst.id,
      name: inst.name,
      encounters: new Map(
        (inst.encounters ?? []).map((e) => [
          e.name,
          { name: e.name, maxItemLevel: e.maxItemLevel ?? null, items: new Map() },
        ]),
      ),
    });
  }

  const upgrades = [];
  const uploadedByCharacter = new Map();

  const handleWishlistNode = (characterId, instance, difficulty, node, wishlistName, weight) => {
    const wishlist = node?.wishlist ?? node; // unwrap docs-style double nesting
    if (!wishlist) return;

    const uploaded = latestTimestamp(wishlist.report_uploaded_at, wishlist.updated_at);
    if (uploaded) {
      const prev = uploadedByCharacter.get(characterId);
      if (!prev || uploaded > prev) uploadedByCharacter.set(characterId, uploaded);
    }

    if (!instancesById.has(instance.id)) {
      instancesById.set(instance.id, { id: instance.id, name: instance.name, encounters: new Map() });
    }
    const instInfo = instancesById.get(instance.id);

    for (const encounter of wishlist.encounters ?? []) {
      if (!instInfo.encounters.has(encounter.name)) {
        instInfo.encounters.set(encounter.name, {
          name: encounter.name,
          maxItemLevel: null,
          items: new Map(),
        });
      }
      const encInfo = instInfo.encounters.get(encounter.name);
      for (const item of encounter.items ?? []) {
        if (!encInfo.items.has(item.id)) {
          encInfo.items.set(item.id, { id: item.id, name: item.name, slot: item.slot ?? '' });
        }
        // Docs shape: item.wishes[]; fall back to flat per-item values.
        const wishes = item.wishes?.length
          ? item.wishes
          : item.percentage || item.absolute
            ? [{ specialization: '', percentage: item.percentage, absolute: item.absolute }]
            : [];
        for (const wish of wishes) {
          if (wish.percentage == null && wish.absolute == null) continue;
          upgrades.push({
            characterId,
            itemId: item.id,
            itemName: item.name,
            slot: item.slot ?? '',
            instanceId: instance.id,
            encounter: encounter.name,
            difficulty,
            spec: wish.specialization ?? '',
            wishlistName,
            wishlistWeight: weight,
            percentage: wish.percentage ?? 0,
            absolute: wish.absolute ?? null,
            updatedAt: wish.timestamp ?? uploaded ?? null,
            manuallyEdited: wish.manually_edited ?? false,
            comment: wish.comment ?? null,
          });
        }
      }
    }
  };

  for (const character of raw.characters ?? []) {
    // Live shape: instances directly on the character.
    for (const instance of character.instances ?? []) {
      for (const diff of instance.difficulties ?? []) {
        handleWishlistNode(character.id, instance, diff.difficulty, diff.wishlist, 'Default', 1);
      }
    }
    // Docs shape: named wishlists, each with instances.
    for (const wl of character.wishlists ?? []) {
      for (const instance of wl.instances ?? []) {
        for (const diff of instance.difficulties ?? []) {
          handleWishlistNode(
            character.id,
            instance,
            diff.difficulty,
            diff.wishlist,
            wl.name ?? 'Default',
            wl.weight ?? 1,
          );
        }
      }
    }
  }

  const instances = [...instancesById.values()].map((inst) => ({
    id: inst.id,
    name: inst.name,
    encounters: [...inst.encounters.values()].map((e) => ({
      name: e.name,
      maxItemLevel: e.maxItemLevel,
      items: [...e.items.values()],
    })),
  }));
  return { instances, upgrades, uploadedByCharacter };
}

/**
 * Resolve item icon names via Wowhead's XML API, reusing icons already present
 * in the previous snapshot so refreshes only fetch newly-seen items.
 */
async function enrichIcons(instances) {
  const cache = new Map();
  try {
    const prev = JSON.parse(readFileSync(join(OUT_DIR, 'wishlists.json'), 'utf8'));
    for (const inst of prev.instances ?? []) {
      for (const enc of inst.encounters ?? []) {
        for (const item of enc.items ?? []) {
          if (item.icon) cache.set(item.id, item.icon);
        }
      }
    }
  } catch {
    // no previous snapshot
  }

  for (const inst of instances) {
    for (const enc of inst.encounters) {
      for (const item of enc.items) {
        if (!cache.has(item.id)) {
          try {
            const res = await fetch(`https://www.wowhead.com/item=${item.id}&xml`);
            const icon = (await res.text()).match(/<icon[^>]*>([^<]+)<\/icon>/)?.[1] ?? null;
            if (icon) cache.set(item.id, icon);
            await new Promise((r) => setTimeout(r, 100));
          } catch {
            // icon stays null
          }
        }
        item.icon = cache.get(item.id) ?? null;
      }
    }
  }
}

async function main() {
  console.log('Fetching wowaudit data…');
  const [team, period, characters] = await Promise.all([
    wowaudit('/team'),
    wowaudit('/period'),
    wowaudit('/characters'),
  ]);

  const region = (team.url?.match(/\/(eu|us|kr|tw|cn)\//i)?.[1] ?? 'eu').toLowerCase();
  const season = period.current_season ?? {};
  const seasonId = season.id;

  const startDate = new Date(Date.now() - ATTENDANCE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [attendanceRaw, wishlistsRaw, lootRaw, ...historyPeriods] = await Promise.all([
    wowaudit(`/attendance?start_date=${startDate}`),
    wowaudit('/wishlists'),
    seasonId != null ? wowaudit(`/loot_history/${seasonId}`) : Promise.resolve({ history_items: [] }),
    // Current + previous weekly reset ≈ the last 10 days of M+ activity.
    wowaudit(`/historical_data?period=${period.current_period}`),
    wowaudit(`/historical_data?period=${period.current_period - 1}`),
  ]);

  // Key levels per character so the app can filter by minimum level.
  const mplusByCharacter = new Map();
  for (const hist of historyPeriods) {
    for (const c of hist.characters ?? []) {
      const levels = (c.data?.dungeons_done ?? []).map((d) => d.level ?? 0);
      mplusByCharacter.set(c.id, [...(mplusByCharacter.get(c.id) ?? []), ...levels]);
    }
  }

  // Season metadata: raid instances with per-boss max ilvl, difficulty cutoffs, tier items.
  const seasonInstances = (season.metadata?.instances ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    encounters: (i.encounters ?? [])
      .slice()
      .sort((a, b) => (a.defaultOrder ?? 0) - (b.defaultOrder ?? 0))
      .map((e) => ({ name: e.name, maxItemLevel: e.maxItemLevel ?? null })),
  }));

  const cutoffs = season.metadata?.track_cutoffs ?? [];
  const ilvlFor = (difficulty) => cutoffs.find((c) => c.difficulty === difficulty)?.ilvl ?? null;
  const seasonIlvls = {
    normal: ilvlFor('normal'),
    heroic: ilvlFor('heroic'),
    mythic: ilvlFor('mythic'),
  };

  const tierItemIds = Object.values(season.tier_items_by_slot ?? {}).flat();

  // Lowest key level whose weekly vault reward is Myth track — the app uses it
  // as the default minimum key level that counts towards M+ effort.
  let vaultMythKeyLevel = null;
  for (const [level, reward] of Object.entries(season.metadata?.great_vault?.dungeon ?? {})) {
    const n = Number(level);
    if (reward?.track === 'Myth' && n > 0 && (vaultMythKeyLevel == null || n < vaultMythKeyLevel)) {
      vaultMythKeyLevel = n;
    }
  }

  const wishlists = flattenWishlists(wishlistsRaw, seasonInstances);
  await enrichIcons(wishlists.instances);

  const roster = [];
  for (const c of characters) {
    let gear = null;
    if (process.env.SKIP_RAIDERIO !== '1') {
      try {
        gear = await fetchGear(region, c);
      } catch {
        gear = null;
      }
      await new Promise((r) => setTimeout(r, 150)); // stay well under Raider.IO rate limits
    }
    roster.push({
      id: c.id,
      name: c.name,
      realm: c.realm,
      class: c.class,
      role: c.role,
      rank: c.rank,
      status: c.status,
      note: c.note ?? null,
      droptimizerUploadedAt: wishlists.uploadedByCharacter.get(c.id) ?? null,
      mplusDungeons: mplusByCharacter.get(c.id) ?? [],
      gear,
    });
    const levels = mplusByCharacter.get(c.id) ?? [];
    console.log(
      `  ${c.name} ${gear ? `(ilvl ${gear.ilvlEquipped ?? '?'})` : '(no gear data)'} — M+ [${levels.join(',')}]`,
    );
  }

  const loot = (lootRaw.history_items ?? []).map((l) => ({
    id: l.id,
    itemId: l.item_id,
    name: l.name,
    icon: l.icon ?? null,
    slot: l.slot ?? '',
    characterId: l.character_id,
    awardedAt: l.awarded_at,
    difficulty: l.difficulty ?? '',
    response: l.response_type?.name ?? null,
    excluded: l.response_type?.excluded ?? false,
    discarded: l.discarded ?? false,
    note: l.note ?? null,
  }));

  const attendance = {
    startDate,
    endDate: null,
    characters: (attendanceRaw.characters ?? []).map((a) => ({
      characterId: a.id,
      name: a.name,
      attendedPercentage: a.attended_percentage ?? 0,
    })),
  };

  const meta = {
    fetchedAt: new Date().toISOString(),
    team: {
      name: team.name,
      guildName: team.guild_name,
      url: team.url ?? null,
      region,
    },
    season: [season.expansion, season.name].filter(Boolean).join(' — ') || null,
    seasonIlvls,
    vaultMythKeyLevel,
    tierItemIds,
    omnitokenName: season.tier_omnitoken?.name ?? null,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const write = (file, data) =>
    writeFile(join(OUT_DIR, file), JSON.stringify(data, null, 1) + '\n');
  await Promise.all([
    write('meta.json', meta),
    write('roster.json', { characters: roster }),
    write('wishlists.json', { instances: wishlists.instances, upgrades: wishlists.upgrades }),
    write('loot-history.json', { seasonId: seasonId ?? null, items: loot }),
    write('attendance.json', attendance),
  ]);

  console.log(
    `Done. ${roster.length} characters, ${wishlists.upgrades.length} wishes, ${loot.length} loot entries → public/data/`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
