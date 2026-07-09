import {
  activityMultiplier,
  computeLps,
  DEFAULT_SETTINGS,
  deltaIlvlForItem,
  effortFactor,
  isSimFresh,
  mplusEffortScore,
  qualifyingRuns,
} from './lps';
import { CharacterGear } from './models';

const S = DEFAULT_SETTINGS;

describe('computeLps', () => {
  it('matches the rules example: grinder wins the close call on effort', () => {
    const grinder = computeLps(
      { deltaIlvl: 5, simPercent: 1.0, effortScore: 10, recentLoot: 0, activity: 1.0 },
      S,
    );
    const logger = computeLps(
      { deltaIlvl: 8, simPercent: 1.1, effortScore: 0, recentLoot: 0, activity: 1.0 },
      S,
    );
    expect(grinder.total).toBeCloseTo(6.0, 2); // (5×0.2 + 1×5) × 1.00
    expect(logger.total).toBeCloseTo(4.97, 2); // (8×0.2 + 1.1×5) × 0.70
    expect(grinder.total).toBeGreaterThan(logger.total);
  });

  it('halves the score after one recent item', () => {
    const base = { deltaIlvl: 0, simPercent: 2, effortScore: 10, recentLoot: 0, activity: 1 };
    const withLoot = computeLps({ ...base, recentLoot: 1 }, S);
    expect(withLoot.total).toBeCloseTo(computeLps(base, S).total / 2, 6);
  });

  it('applies the casual multiplier', () => {
    const r = computeLps(
      { deltaIlvl: 10, simPercent: 1, effortScore: 10, recentLoot: 0, activity: 0.75 },
      S,
    );
    expect(r.total).toBeCloseTo((10 * 0.2 + 1 * 5) * 0.75, 6);
  });
});

describe('effort factor fairness invariants', () => {
  const lps = (simPercent: number, effortScore: number) =>
    computeLps({ deltaIlvl: 0, simPercent, effortScore, recentLoot: 0, activity: 1 }, S).total;

  it('spans exactly floor..1.0', () => {
    expect(effortFactor(0, S)).toBeCloseTo(0.7, 6);
    expect(effortFactor(5, S)).toBeCloseTo(0.85, 6);
    expect(effortFactor(10, S)).toBeCloseTo(1.0, 6);
  });

  it('effort alone cannot win an item against real need', () => {
    // Max effort with a token 0.5% sim loses to a 2.5% upgrade with zero keys.
    expect(lps(0.5, 10)).toBeLessThan(lps(2.5, 0));
  });

  it('effort decides between comparable upgrades', () => {
    // 1.0% with full effort beats 1.2% from a raid-logger.
    expect(lps(1.0, 10)).toBeGreaterThan(lps(1.2, 0));
  });

  it('the worst effort penalty is bounded by the floor (30%)', () => {
    expect(lps(2.0, 0) / lps(2.0, 10)).toBeCloseTo(0.7, 6);
  });

  it('is monotonic: more effort or more sim never lowers the score', () => {
    for (let m = 0; m < 10; m++) {
      expect(lps(1, m + 1)).toBeGreaterThanOrEqual(lps(1, m));
    }
    expect(lps(1.5, 5)).toBeGreaterThan(lps(1.0, 5));
  });

  it('zero need stays zero regardless of effort', () => {
    expect(lps(0, 10)).toBe(0);
  });
});

describe('mplusEffortScore (capped absolute scale)', () => {
  it('reaches full marks at the cap', () => {
    expect(mplusEffortScore(8, 8)).toBe(10);
  });

  it('scales linearly below the cap', () => {
    expect(mplusEffortScore(4, 8)).toBe(5);
    expect(mplusEffortScore(2, 8)).toBe(2.5);
    expect(mplusEffortScore(0, 8)).toBe(0);
  });

  it('is robust to outliers: farming past the cap changes nothing', () => {
    expect(mplusEffortScore(30, 8)).toBe(mplusEffortScore(8, 8));
  });

  it('a dead week does not hand out full marks for two keys', () => {
    // Under the old relative scale, 2 keys would be 100% if nobody else ran any.
    expect(mplusEffortScore(2, 8)).toBe(2.5);
  });

  it('handles a nonsensical cap', () => {
    expect(mplusEffortScore(5, 0)).toBe(0);
  });
});

describe('qualifyingRuns', () => {
  it('counts only keys at or above the minimum level', () => {
    expect(qualifyingRuns([2, 9, 10, 12, 15], 10)).toBe(3);
    expect(qualifyingRuns([], 10)).toBe(0);
  });
});

describe('isSimFresh', () => {
  const now = new Date('2026-07-09T12:00:00Z').getTime();

  it('accepts sims inside the window and rejects older ones', () => {
    expect(isSimFresh('2026-07-01T12:00:00Z', 14, now)).toBe(true);
    expect(isSimFresh('2026-06-01T12:00:00Z', 14, now)).toBe(false);
  });

  it('treats a missing timestamp as stale', () => {
    expect(isSimFresh(null, 14, now)).toBe(false);
    expect(isSimFresh(undefined, 14, now)).toBe(false);
  });
});

describe('activityMultiplier', () => {
  it('maps council status to the multiplier', () => {
    expect(activityMultiplier('regular', S)).toBe(1.0);
    expect(activityMultiplier('casual', S)).toBe(0.75);
  });

  it('defaults to regular when no status is set', () => {
    expect(activityMultiplier(null, S)).toBe(1.0);
    expect(activityMultiplier(undefined, S)).toBe(1.0);
  });
});

function gearWith(slots: CharacterGear['slots']): CharacterGear {
  return { ilvlEquipped: 700, slots, updatedAt: null };
}

describe('deltaIlvlForItem', () => {
  const gear = gearWith({
    finger1: { ilvl: 700 },
    finger2: { ilvl: 715 },
    mainhand: { ilvl: 720 },
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
