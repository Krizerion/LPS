import { CharacterGear, Difficulty, WowRole } from './models';

/**
 * LPS = ((ΔI × wI) + (S × wS)) / (1 + L) × A × F
 *
 * ΔI — item level difference between the drop and the equipped item in that slot
 * S  — droptimizer sim upgrade in % (0 for tanks/healers, and 0 when the sim is stale)
 * L  — items received in the recent loot window
 * A  — activity multiplier (Редовен 1.0 / Нередовен 0.75), a council decision
 * F  — M+ effort factor between effortFloor and 1.0, from the effort score M
 *
 * M (0..10) counts M+ dungeons at or above mplusMinLevel over the last two
 * weekly resets, capped: mplusCapRuns keys or more = 10. Effort therefore
 * MODULATES need instead of replacing it — a player with no upgrade cannot win
 * on effort alone, but effort decides between comparable upgrades.
 *
 * Enchants/gems are deliberately NOT scored — being fully enchanted is assumed.
 */
export interface LpsWeights {
  deltaIlvl: number;
  simPercent: number;
}

export interface LpsSettings {
  weights: LpsWeights;
  /** Days that count as "recent" for the L penalty. */
  lootWindowDays: number;
  regularMultiplier: number;
  casualMultiplier: number;
  /** Item level of drops per difficulty for the current season. */
  difficultyIlvl: Record<Difficulty, number>;
  /**
   * Zero the sim for tanks (their throughput sims aren't comparable to DPS).
   * Healers ARE included — they compete on their QELive/droptimizer sim.
   */
  zeroSimForTanks: boolean;
  /** F at zero effort; F scales linearly up to 1.0 at M = 10. */
  effortFloor: number;
  /** This many qualifying keys (or more) over two resets = full effort. */
  mplusCapRuns: number;
  /**
   * Keys below this level don't count towards effort.
   * null = auto: the lowest key level that awards a Myth-track vault item,
   * taken from the current season's data (meta.json).
   */
  mplusMinLevel: number | null;
  /**
   * Players whose equipped ilvl is at or above this are "graduated" — M+ no
   * longer provides upgrades for them, so stopping keys is rational and they
   * get the full effort factor.
   * null = auto: the season's mythic track cutoff from meta.json, so the rule
   * re-arms itself every new season without touching code or settings.
   */
  effortGraduationIlvl: number | null;
  /** Sims older than this contribute S = 0. */
  simMaxAgeDays: number;
  /** Top candidates within this % of #1 should roll the item off. */
  rollThresholdPct: number;
}

export const DEFAULT_SETTINGS: LpsSettings = {
  weights: { deltaIlvl: 0.2, simPercent: 5 },
  lootWindowDays: 7,
  regularMultiplier: 1.0,
  casualMultiplier: 0.75,
  // Midnight Season 1 track cutoffs; real values come from meta.json seasonIlvls.
  difficultyIlvl: { normal: 246, heroic: 259, mythic: 272 },
  zeroSimForTanks: true,
  effortFloor: 0.7,
  mplusCapRuns: 8,
  mplusMinLevel: null,
  effortGraduationIlvl: null,
  simMaxAgeDays: 14,
  rollThresholdPct: 10,
};

/** Fallbacks when neither the setting nor the season data provides a value. */
export const FALLBACK_MPLUS_MIN_LEVEL = 10;
export const FALLBACK_GRADUATION_ILVL = 272;

export interface LpsInput {
  deltaIlvl: number;
  simPercent: number;
  /** M, 0..10 — see mplusEffortScore. */
  effortScore: number;
  recentLoot: number;
  activity: number;
}

export interface LpsBreakdown extends LpsInput {
  ilvlComponent: number;
  simComponent: number;
  effortFactor: number;
  total: number;
}

export function effortFactor(effortScore: number, settings: Pick<LpsSettings, 'effortFloor'>): number {
  const floor = Math.min(1, Math.max(0, settings.effortFloor));
  const normalized = Math.min(10, Math.max(0, effortScore)) / 10;
  return floor + (1 - floor) * normalized;
}

export function computeLps(
  input: LpsInput,
  settings: Pick<LpsSettings, 'weights' | 'effortFloor'>,
): LpsBreakdown {
  const ilvlComponent = input.deltaIlvl * settings.weights.deltaIlvl;
  const simComponent = input.simPercent * settings.weights.simPercent;
  const factor = effortFactor(input.effortScore, settings);
  const total =
    ((ilvlComponent + simComponent) / (1 + input.recentLoot)) * input.activity * factor;
  return { ...input, ilvlComponent, simComponent, effortFactor: factor, total };
}

/**
 * Capped absolute M+ effort (0..10): capRuns qualifying keys or more over the
 * window = 10; fewer scale linearly. Not relative to other players, so one
 * no-lifer can't deflate everyone else's score and a dead week doesn't
 * hand out full marks for two keys.
 */
export function mplusEffortScore(qualifyingRuns: number, capRuns: number): number {
  if (capRuns <= 0) return 0;
  return Math.round(Math.min(1, qualifyingRuns / capRuns) * 100) / 10;
}

/** Runs at or above the minimum key level count towards effort. */
export function qualifyingRuns(dungeonLevels: number[], minLevel: number): number {
  return dungeonLevels.filter((level) => level >= minLevel).length;
}

/**
 * The effort score, with the graduation rule: a player geared past the point
 * where M+ provides upgrades has finished that farm — no keys required.
 */
export function effortScoreFor(
  dungeonLevels: number[],
  equippedIlvl: number | null,
  opts: { capRuns: number; minLevel: number; graduationIlvl: number },
): { score: number; graduated: boolean } {
  if (equippedIlvl != null && equippedIlvl >= opts.graduationIlvl) {
    return { score: 10, graduated: true };
  }
  return {
    score: mplusEffortScore(qualifyingRuns(dungeonLevels, opts.minLevel), opts.capRuns),
    graduated: false,
  };
}

/**
 * How many leading candidates (sorted by total, descending) are within
 * thresholdPct of the top score — 2 or more means "roll it off".
 */
export function closeCallCount(sortedTotals: number[], thresholdPct: number): number {
  if (sortedTotals.length < 2 || sortedTotals[0] <= 0) return 1;
  const cutoff = sortedTotals[0] * (1 - thresholdPct / 100);
  let count = 1;
  while (count < sortedTotals.length && sortedTotals[count] >= cutoff) count++;
  return count;
}

/** A sim only counts while it's fresh; stale droptimizers contribute S = 0. */
export function isSimFresh(
  updatedAt: string | null | undefined,
  maxAgeDays: number,
  now: number = Date.now(),
): boolean {
  if (!updatedAt) return false;
  return now - new Date(updatedAt).getTime() <= maxAgeDays * 86_400_000;
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

export function isTank(role: WowRole): boolean {
  return role === 'Tank';
}
