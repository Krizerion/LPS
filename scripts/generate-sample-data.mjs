#!/usr/bin/env node
/**
 * Generates a deterministic sample dataset in public/data/ so the site works
 * out of the box without a wowaudit API key. Real data from
 * scripts/fetch-data.mjs overwrites these files with the same shape.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

// Deterministic PRNG so regenerating produces identical files.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260709);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + rand() * (max - min);

const NOW = new Date('2026-07-09T12:00:00Z').getTime();
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

const ROSTER_DEF = [
  ['Kragmar', 'Warrior', 'Tank', 96],
  ['Thornveil', 'Death Knight', 'Tank', 88],
  ['Lumienne', 'Priest', 'Heal', 92],
  ['Verdantis', 'Druid', 'Heal', 78],
  ['Zelphira', 'Shaman', 'Heal', 66],
  ['Pyrelith', 'Mage', 'Ranged', 98],
  ['Umbrashot', 'Hunter', 'Ranged', 84],
  ['Voidrenna', 'Warlock', 'Ranged', 71],
  ['Stormcaller', 'Evoker', 'Ranged', 90],
  ['Bladewyn', 'Rogue', 'Melee', 94],
  ['Feralynx', 'Demon Hunter', 'Melee', 62],
  ['Dawnfist', 'Monk', 'Melee', 86],
  ['Runeaxe', 'Warrior', 'Melee', 55],
  ['Solmara', 'Paladin', 'Melee', 81],
];

const GEAR_SLOTS = [
  'head', 'neck', 'shoulder', 'back', 'chest', 'waist', 'wrist', 'hands',
  'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainhand',
];

const INSTANCE = {
  id: 30,
  name: 'Sanctum of the Radiant Dusk',
  // [boss, mythic max drop ilvl, slot pool]
  encounters: [
    ['Warden Ashvale', 272, ['head', 'wrists', 'trinket']],
    ['The Twinflame Court', 272, ['shoulders', 'waist', 'one_hand']],
    ['Grothek the Devourer', 276, ['chest', 'finger', 'main_hand_2h']],
    ['Seraphine, Duskbinder', 276, ['back', 'hands', 'trinket']],
    ['Molten Custodian', 279, ['legs', 'feet', 'shield']],
    ['Nhal\'zeth the Unseen', 279, ['neck', 'wrists', 'one_hand']],
    ['Archon Velatra', 282, ['finger', 'trinket', 'main_hand_2h']],
    ['Duskmourn, the Last Light', 282, ['chest', 'head', 'one_hand', 'trinket']],
  ],
};

const ITEM_PREFIXES = ['Duskforged', 'Radiant', 'Ashen', 'Twinflame', 'Molten', 'Veiled', 'Seraphic', 'Umbral'];
const ITEM_BASES = {
  head: 'Crown', shoulders: 'Mantle', back: 'Drape', chest: 'Breastplate', waist: 'Cincture',
  wrists: 'Bindings', hands: 'Grips', legs: 'Legguards', feet: 'Striders', neck: 'Locket',
  finger: 'Seal', trinket: 'Idol', one_hand: 'Blade', main_hand_2h: 'Greatstaff', shield: 'Bulwark',
};

// --- roster ---
const characters = ROSTER_DEF.map(([name, klass, role, attendance], i) => {
  const quality = between(0.3, 1); // how well-maintained this character is
  const slots = {};
  for (const slot of GEAR_SLOTS) {
    slots[slot] = {
      ilvl: Math.round(between(244, 254) + quality * between(8, 18)),
      enchantId: rand() < quality * 0.95 ? 7000 + i * 20 + GEAR_SLOTS.indexOf(slot) : null,
      gems: slot.startsWith('finger') && rand() < quality ? [213743] : [],
    };
  }
  const ilvls = Object.values(slots).map((s) => s.ilvl);
  return {
    id: i + 1,
    name,
    realm: 'Silvermoon',
    class: klass,
    role,
    rank: 'Main',
    status: 'tracking',
    note: null,
    _attendance: attendance,
    _quality: quality,
    gear: {
      ilvlEquipped: Math.round((ilvls.reduce((a, b) => a + b, 0) / ilvls.length) * 10) / 10,
      slots,
      updatedAt: daysAgo(between(0, 3)),
    },
  };
});

// --- wishlists / droptimizer upgrades ---
let itemId = 251000;
const encounters = INSTANCE.encounters.map(([name, maxItemLevel, slotPool]) => ({
  name,
  maxItemLevel,
  items: slotPool.map((slot) => ({
    id: itemId++,
    name: `${pick(ITEM_PREFIXES)} ${ITEM_BASES[slot] ?? 'Relic'}`,
    slot,
  })),
}));
// Head/chest/legs pieces double as "tier" items for the hard-reserve badge.
const tierItemIds = encounters
  .flatMap((e) => e.items)
  .filter((i) => ['head', 'chest', 'legs'].includes(i.slot))
  .map((i) => i.id);

const upgrades = [];
for (const c of characters) {
  const isDps = c.role === 'Melee' || c.role === 'Ranged';
  const uploadedAt = daysAgo(between(0, c._quality > 0.7 ? 6 : 20));
  c._uploadedAt = uploadedAt;
  for (const difficulty of ['heroic', 'mythic']) {
    for (const enc of encounters) {
      for (const item of enc.items) {
        if (rand() > 0.55) continue; // not every item is an upgrade for everyone
        const magnitude = (1.05 - c._quality) * (difficulty === 'mythic' ? 1.6 : 1.0);
        upgrades.push({
          characterId: c.id,
          itemId: item.id,
          itemName: item.name,
          slot: item.slot,
          instanceId: INSTANCE.id,
          encounter: enc.name,
          difficulty,
          spec: isDps ? 'Main Spec' : c.role,
          wishlistName: 'Single target',
          wishlistWeight: 1,
          percentage: isDps ? Math.round(between(0.05, 3.2) * magnitude * 100) / 100 : 0,
          absolute: null,
          updatedAt: uploadedAt,
          manuallyEdited: false,
          comment: rand() < 0.06 ? 'BIS' : null,
        });
      }
    }
  }
}

// --- loot history ---
const RESPONSES = [
  { name: 'Main', excluded: false, w: 0.7 },
  { name: 'Minor', excluded: false, w: 0.2 },
  { name: 'Offspec', excluded: true, w: 0.1 },
];
const allItems = encounters.flatMap((e) => e.items);
const loot = [];
for (let i = 0; i < 38; i++) {
  const item = pick(allItems);
  const c = pick(characters);
  const r = rand();
  const response = r < 0.7 ? RESPONSES[0] : r < 0.9 ? RESPONSES[1] : RESPONSES[2];
  loot.push({
    id: i + 1,
    itemId: item.id,
    name: item.name,
    icon: null,
    slot: item.slot,
    characterId: c.id,
    awardedAt: daysAgo(between(0, 35)),
    difficulty: rand() < 0.6 ? 'mythic' : 'heroic',
    response: response.name,
    excluded: response.excluded,
    discarded: false,
    note: null,
  });
}
loot.sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));

// --- write files ---
await mkdir(OUT_DIR, { recursive: true });
const write = (file, data) => writeFile(join(OUT_DIR, file), JSON.stringify(data, null, 1) + '\n');
await Promise.all([
  write('meta.json', {
    fetchedAt: daysAgo(0),
    sample: true,
    team: { name: 'Sample Roster', guildName: 'Radiant Dusk (sample)', url: null, region: 'eu' },
    season: 'Sample — Season 2',
    seasonIlvls: { normal: 246, heroic: 259, mythic: 272 },
    tierItemIds,
    omnitokenName: null,
  }),
  write('roster.json', {
    characters: characters.map(({ _attendance, _quality, _uploadedAt, ...c }) => ({
      ...c,
      droptimizerUploadedAt: _uploadedAt,
    })),
  }),
  write('wishlists.json', {
    instances: [{ id: INSTANCE.id, name: INSTANCE.name, encounters }],
    upgrades,
  }),
  write('loot-history.json', { seasonId: null, items: loot }),
  write('attendance.json', {
    startDate: daysAgo(60).slice(0, 10),
    endDate: null,
    characters: characters.map((c) => ({
      characterId: c.id,
      name: c.name,
      attendedPercentage: c._attendance,
    })),
  }),
]);
console.log(
  `Sample data written: ${characters.length} characters, ${upgrades.length} wishes, ${loot.length} loot entries`,
);
