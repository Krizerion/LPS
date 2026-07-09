import {
  activityMultiplier,
  computeLps,
  DEFAULT_SETTINGS,
  deltaIlvlForItem,
  enchantScoreFromGear,
} from './lps';
import { CharacterGear } from './models';

describe('computeLps', () => {
  const weights = DEFAULT_SETTINGS.weights;

  it('matches the rules example for the M+ grinder', () => {
    const r = computeLps(
      { deltaIlvl: 5, simPercent: 1.0, enchantScore: 10, recentLoot: 0, activity: 1.0 },
      weights,
    );
    expect(r.total).toBeCloseTo(31.0, 2);
  });

  it('matches the rules example for the raid-logger', () => {
    const r = computeLps(
      { deltaIlvl: 25, simPercent: 2.5, enchantScore: 0, recentLoot: 0, activity: 1.0 },
      weights,
    );
    expect(r.total).toBeCloseTo(17.5, 2);
  });

  it('halves the score after one recent item', () => {
    const base = { deltaIlvl: 0, simPercent: 2, enchantScore: 10, recentLoot: 0, activity: 1 };
    const withLoot = computeLps({ ...base, recentLoot: 1 }, weights);
    expect(withLoot.total).toBeCloseTo(computeLps(base, weights).total / 2, 6);
  });

  it('applies the casual multiplier', () => {
    const base = { deltaIlvl: 10, simPercent: 1, enchantScore: 5, recentLoot: 0, activity: 0.7 };
    const r = computeLps(base, weights);
    expect(r.total).toBeCloseTo((10 * 0.2 + 1 * 5 + 5 * 2.5) * 0.7, 6);
  });
});

describe('activityMultiplier', () => {
  it('uses the threshold when no override is set', () => {
    expect(activityMultiplier(90, null, DEFAULT_SETTINGS)).toBe(1.0);
    expect(activityMultiplier(50, null, DEFAULT_SETTINGS)).toBe(0.7);
  });

  it('respects manual overrides', () => {
    expect(activityMultiplier(50, 'regular', DEFAULT_SETTINGS)).toBe(1.0);
    expect(activityMultiplier(95, 'casual', DEFAULT_SETTINGS)).toBe(0.7);
  });

  it('treats unknown attendance as regular', () => {
    expect(activityMultiplier(null, null, DEFAULT_SETTINGS)).toBe(1.0);
  });
});

function gearWith(slots: CharacterGear['slots']): CharacterGear {
  return { ilvlEquipped: 700, slots, updatedAt: null };
}

describe('enchantScoreFromGear', () => {
  it('returns 10 for fully enchanted gear (with a gem)', () => {
    const slots: CharacterGear['slots'] = {};
    for (const s of ['back', 'chest', 'wrist', 'legs', 'feet', 'finger1', 'finger2', 'mainhand']) {
      slots[s] = { ilvl: 700, enchantId: 1, gems: s === 'finger1' ? [1] : [] };
    }
    expect(enchantScoreFromGear(gearWith(slots))).toBe(10);
  });

  it('returns 0 for no enchants', () => {
    const slots: CharacterGear['slots'] = {
      back: { ilvl: 700, enchantId: null, gems: [] },
      chest: { ilvl: 700, enchantId: null, gems: [] },
    };
    expect(enchantScoreFromGear(gearWith(slots))).toBe(0);
  });

  it('returns null without gear data', () => {
    expect(enchantScoreFromGear(null)).toBeNull();
  });
});

describe('deltaIlvlForItem', () => {
  const gear = gearWith({
    finger1: { ilvl: 700, enchantId: null, gems: [] },
    finger2: { ilvl: 715, enchantId: null, gems: [] },
    mainhand: { ilvl: 720, enchantId: null, gems: [] },
  });

  it('compares rings against the weakest equipped ring', () => {
    expect(deltaIlvlForItem(gear, 'finger', 723)).toBe(23);
  });

  it('maps two-handed drops to the main hand', () => {
    expect(deltaIlvlForItem(gear, 'main_hand_2h', 723)).toBe(3);
  });

  it('never returns a negative delta', () => {
    expect(deltaIlvlForItem(gear, 'main_hand', 700)).toBe(0);
  });

  it('returns null for unknown slots', () => {
    expect(deltaIlvlForItem(gear, 'chest', 723)).toBeNull();
  });
});
