#!/usr/bin/env node
/**
 * Pulls guild data from the wowaudit public API (plus per-character gear from
 * Raider.IO) and writes the JSON snapshots the site reads from public/data/.
 *
 * Usage:
 *   WOWAUDIT_API_KEY=xxxx node scripts/fetch-data.mjs
 *   node scripts/fetch-data.mjs --key xxxx
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
    slots[slot] = {
      ilvl: item.item_level,
      enchantId: item.enchant ?? null,
      gems: item.gems ?? [],
    };
  }
  return {
    ilvlEquipped: data.gear?.item_level_equipped ?? null,
    slots,
    updatedAt: data.last_crawled_at ?? null,
  };
}

function flattenWishlists(raw) {
  const instancesById = new Map();
  const upgrades = [];

  for (const character of raw.characters ?? []) {
    for (const wl of character.wishlists ?? []) {
      for (const instance of wl.instances ?? []) {
        if (!instancesById.has(instance.id)) {
          instancesById.set(instance.id, { id: instance.id, name: instance.name, encounters: new Map() });
        }
        const instInfo = instancesById.get(instance.id);
        for (const diff of instance.difficulties ?? []) {
          const wishlist = diff.wishlist?.wishlist;
          for (const encounter of wishlist?.encounters ?? []) {
            if (!instInfo.encounters.has(encounter.name)) {
              instInfo.encounters.set(encounter.name, new Map());
            }
            const itemMap = instInfo.encounters.get(encounter.name);
            for (const item of encounter.items ?? []) {
              if (!itemMap.has(item.id)) {
                itemMap.set(item.id, { id: item.id, name: item.name, slot: item.slot ?? '' });
              }
              for (const wish of item.wishes ?? []) {
                if (wish.percentage == null && wish.absolute == null) continue;
                upgrades.push({
                  characterId: character.id,
                  itemId: item.id,
                  itemName: item.name,
                  slot: item.slot ?? '',
                  instanceId: instance.id,
                  encounter: encounter.name,
                  difficulty: diff.difficulty,
                  spec: wish.specialization ?? '',
                  wishlistName: wl.name ?? 'Default',
                  wishlistWeight: wl.weight ?? 1,
                  percentage: wish.percentage ?? 0,
                  absolute: wish.absolute ?? null,
                  updatedAt: wish.timestamp ?? null,
                  manuallyEdited: wish.manually_edited ?? false,
                  comment: wish.comment ?? null,
                });
              }
            }
          }
        }
      }
    }
  }

  const instances = [...instancesById.values()].map((inst) => ({
    id: inst.id,
    name: inst.name,
    encounters: [...inst.encounters.entries()].map(([name, items]) => ({
      name,
      items: [...items.values()],
    })),
  }));
  return { instances, upgrades };
}

async function main() {
  console.log('Fetching wowaudit data…');
  const [team, period, characters] = await Promise.all([
    wowaudit('/team'),
    wowaudit('/period'),
    wowaudit('/characters'),
  ]);

  const region = (team.url?.match(/wowaudit\.com\/(\w+)\//)?.[1] ?? 'eu').toLowerCase();
  const seasonId = period.current_season?.keystone_season_id ?? period.current_season?.id;

  const startDate = new Date(Date.now() - ATTENDANCE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [attendanceRaw, wishlistsRaw, lootRaw] = await Promise.all([
    wowaudit(`/attendance?start_date=${startDate}`),
    wowaudit('/wishlists'),
    seasonId != null ? wowaudit(`/loot_history/${seasonId}`) : Promise.resolve({ history_items: [] }),
  ]);

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
      gear,
    });
    console.log(`  ${c.name} ${gear ? `(ilvl ${gear.ilvlEquipped ?? '?'})` : '(no gear data)'}`);
  }

  const wishlists = flattenWishlists(wishlistsRaw);

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
    sample: false,
    team: {
      name: team.name,
      guildName: team.guild_name,
      url: team.url ?? null,
      region,
    },
    season: period.current_season?.name ?? null,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const write = (file, data) =>
    writeFile(join(OUT_DIR, file), JSON.stringify(data, null, 1) + '\n');
  await Promise.all([
    write('meta.json', meta),
    write('roster.json', { characters: roster }),
    write('wishlists.json', wishlists),
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
