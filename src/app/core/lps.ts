import { CharacterGear, Difficulty, WowRole } from './models';

/**
 * LPS = ((ΔI * wI) + (S * wS) + (E * wE)) / (1 + L) * A
 *
 * ΔI — item level difference between the drop and the equipped item in that slot
 * S  — droptimizer sim upgrade in % (0 for tanks/healers)
 * E  — enchant/gem investment score, 0..10
 * L  — items received in the recent loot window
 * A  — activity multiplier (regular 1.0 / casual 0.7)
 */
export interface LpsWeights {
  deltaIlvl: number;
  simPercent: number;
  enchant: number;
}

export interface LpsSettings {
  weights: LpsWeights;
  /** Days that count as "recent" for the L penalty. */
  lootWindowDays: number;
  regularMultiplier: number;
  casualMultiplier: number;
  /** Item level of drops per difficulty for the current season. */
  difficultyIlvl: Record<Difficulty, number>;
  /** Per the rules, sim upgrades only apply to DPS players. */
  zeroSimForTanksHealers: boolean;
}

export const DEFAULT_SETTINGS: LpsSettings = {
  weights: { deltaIlvl: 0.2, simPercent: 5, enchant: 2.0 },
  lootWindowDays: 14,
  regularMultiplier: 1.0,
  casualMultiplier: 0.75,
  // Midnight Season 1 track cutoffs; real values come from meta.json seasonIlvls.
  difficultyIlvl: { normal: 246, heroic: 259, mythic: 272 },
  zeroSimForTanksHealers: true,
};

export interface LpsInput {
  deltaIlvl: number;
  simPercent: number;
  enchantScore: number;
  recentLoot: number;
  activity: number;
}

export interface LpsBreakdown extends LpsInput {
  ilvlComponent: number;
  simComponent: number;
  enchantComponent: number;
  total: number;
}

export function computeLps(input: LpsInput, weights: LpsWeights): LpsBreakdown {
  const ilvlComponent = input.deltaIlvl * weights.deltaIlvl;
  const simComponent = input.simPercent * weights.simPercent;
  const enchantComponent = input.enchantScore * weights.enchant;
  const total =
    ((ilvlComponent + simComponent + enchantComponent) / (1 + input.recentLoot)) * input.activity;
  return { ...input, ilvlComponent, simComponent, enchantComponent, total };
}

/** Slots that can hold an enchant in the current season. */
export const ENCHANTABLE_SLOTS = [
  'back',
  'chest',
  'wrist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'mainhand',
] as const;

/**
 * Derive the E score (0..10) from equipped gear: share of enchantable slots
 * that actually carry an enchant. Gems are a bonus on top, capped at 10.
 */
export function enchantScoreFromGear(gear: CharacterGear | null): number | null {
  if (!gear) return null;
  const present = ENCHANTABLE_SLOTS.filter((s) => gear.slots[s]);
  if (present.length === 0) return null;
  const enchanted = present.filter((s) => gear.slots[s].enchantId != null).length;
  const gemmed = Object.values(gear.slots).some((s) => s.gems.length > 0) ? 0.5 : 0;
  const score = (enchanted / present.length) * 10 + gemmed;
  return Math.round(Math.min(10, score) * 10) / 10;
}

/** Maps wowaudit wishlist slot names to the Raider.IO gear slots an item competes with. */
const SLOT_MAP: Record<string, string[]> = {
  head: ['head'],
  neck: ['neck'],
  shoulder: ['shoulder'],
  shoulders: ['shoulder'],
  back: ['back'],
  cloak: ['back'],
  chest: ['chest'],
  waist: ['waist'],
  wrist: ['wrist'],
  wrists: ['wrist'],
  hands: ['hands'],
  legs: ['legs'],
  feet: ['feet'],
  finger: ['finger1', 'finger2'],
  finger_1: ['finger1'],
  finger_2: ['finger2'],
  trinket: ['trinket1', 'trinket2'],
  trinket_1: ['trinket1'],
  trinket_2: ['trinket2'],
  main_hand: ['mainhand'],
  main_hand_2h: ['mainhand'],
  two_hand: ['mainhand'],
  one_hand: ['mainhand'],
  off_hand: ['offhand'],
  offhand: ['offhand'],
  shield: ['offhand'],
  ranged: ['mainhand'],
};

/**
 * ΔI for a drop: drop ilvl minus the equipped ilvl in the matching slot.
 * For rings/trinkets the weakest of the two equipped items is replaced.
 * Returns null when the equipped item level is unknown.
 */
export function deltaIlvlForItem(
  gear: CharacterGear | null,
  wishlistSlot: string,
  dropIlvl: number,
): number | null {
  if (!gear) return null;
  const slots = SLOT_MAP[wishlistSlot?.toLowerCase()] ?? null;
  if (!slots) return null;
  const equipped = slots
    .map((s) => gear.slots[s]?.ilvl)
    .filter((v): v is number => typeof v === 'number');
  if (equipped.length === 0) return null;
  return Math.max(0, dropIlvl - Math.min(...equipped));
}

/**
 * Activity is a loot-council decision, not derived from (sometimes buggy)
 * attendance tracking: local override > committed overrides.json > regular.
 */
export function activityMultiplier(
  status: 'regular' | 'casual' | null | undefined,
  settings: LpsSettings,
): number {
  return status === 'casual' ? settings.casualMultiplier : settings.regularMultiplier;
}

export function isTankOrHealer(role: WowRole): boolean {
  return role === 'Tank' || role === 'Heal';
}
