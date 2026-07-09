import { CharacterGear, Difficulty, WowRole } from './models';

/**
 * LPS = ((ΔI * wI) + (S * wS) + (M * wM)) / (1 + L) * A
 *
 * ΔI — item level difference between the drop and the equipped item in that slot
 * S  — droptimizer sim upgrade in % (0 for tanks/healers)
 * M  — relative M+ effort 0..10: the roster's busiest key runner over the last
 *      two weekly resets scores 10, everyone else proportionally to their runs
 * L  — items received in the recent loot window
 * A  — activity multiplier (regular 1.0 / casual 0.75)
 *
 * Enchants/gems are deliberately NOT scored — being fully enchanted is assumed.
 */
export interface LpsWeights {
  deltaIlvl: number;
  simPercent: number;
  effort: number;
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
  weights: { deltaIlvl: 0.2, simPercent: 5, effort: 2.0 },
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
  effortScore: number;
  recentLoot: number;
  activity: number;
}

export interface LpsBreakdown extends LpsInput {
  ilvlComponent: number;
  simComponent: number;
  effortComponent: number;
  total: number;
}

export function computeLps(input: LpsInput, weights: LpsWeights): LpsBreakdown {
  const ilvlComponent = input.deltaIlvl * weights.deltaIlvl;
  const simComponent = input.simPercent * weights.simPercent;
  const effortComponent = input.effortScore * weights.effort;
  const total =
    ((ilvlComponent + simComponent + effortComponent) / (1 + input.recentLoot)) * input.activity;
  return { ...input, ilvlComponent, simComponent, effortComponent, total };
}

/**
 * Relative M+ effort (0..10): the roster's busiest key runner in the window
 * sets the bar at 10; everyone else scales by their share of that count.
 */
export function mplusEffortScore(runs: number, topRuns: number): number {
  if (topRuns <= 0) return 0;
  return Math.round(Math.min(1, runs / topRuns) * 100) / 10;
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
