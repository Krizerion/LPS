import { HttpClient } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import {
  activityMultiplier,
  computeLps,
  deltaIlvlForItem,
  effortScoreFor,
  FALLBACK_GRADUATION_ILVL,
  FALLBACK_MPLUS_MIN_LEVEL,
  isSimFresh,
  isTank,
  LpsBreakdown,
  qualifyingRuns,
} from '../core/lps';
import {
  AttendanceFile,
  DataMeta,
  Difficulty,
  EncounterItem,
  InstanceInfo,
  LootAward,
  LootHistoryFile,
  RepoOverrides,
  RosterCharacter,
  RosterFile,
  WishlistsFile,
  WishUpgrade,
} from '../core/models';
import { SettingsStore } from './settings.store';

export interface PlayerSummary {
  character: RosterCharacter;
  activity: number;
  activityStatus: 'regular' | 'casual';
  /** True when set from this browser (localStorage) rather than overrides.json. */
  activityOverridden: boolean;
  /** Keys at or above the configured minimum level in the window. */
  mplusRuns: number;
  /** Total keys regardless of level (shown as context). */
  mplusTotalRuns: number;
  /** Capped absolute effort 0..10 (mplusCapRuns keys = 10, or graduated). */
  effortScore: number;
  /** True when equipped ilvl passed the graduation threshold — M+ can't upgrade them. */
  effortGraduated: boolean;
  recentLoot: number;
  totalLoot: number;
  lastLootAt: string | null;
  wishlistUpdatedAt: string | null;
}

export interface LootCandidate {
  character: RosterCharacter;
  wish: WishUpgrade | null;
  /** null when the equipped item level for the slot is unknown. */
  deltaIlvl: number | null;
  breakdown: LpsBreakdown;
}

interface GuildState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
  meta: DataMeta | null;
  roster: RosterCharacter[];
  instances: InstanceInfo[];
  upgrades: WishUpgrade[];
  loot: LootAward[];
  attendance: AttendanceFile | null;
  repoOverrides: RepoOverrides;
}

const initialState: GuildState = {
  status: 'idle',
  error: null,
  meta: null,
  roster: [],
  instances: [],
  upgrades: [],
  loot: [],
  attendance: null,
  repoOverrides: { activity: {} },
};

export const GuildStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => ({
    _http: inject(HttpClient),
    _settings: inject(SettingsStore),
  })),
  withComputed((store) => ({
    charactersById: computed(() => {
      const map = new Map<number, RosterCharacter>();
      for (const c of store.roster()) map.set(c.id, c);
      return map;
    }),
    /** Setting override > current season data > static fallback. */
    resolvedMplusMinLevel: computed(
      () =>
        store._settings.settings().mplusMinLevel ??
        store.meta()?.vaultMythKeyLevel ??
        FALLBACK_MPLUS_MIN_LEVEL,
    ),
    resolvedGraduationIlvl: computed(
      () =>
        store._settings.settings().effortGraduationIlvl ??
        store.meta()?.seasonIlvls?.mythic ??
        FALLBACK_GRADUATION_ILVL,
    ),
    /** Non-discarded, non-excluded awards inside the recent-loot window. */
    recentLootById: computed(() => {
      const windowDays = store._settings.settings().lootWindowDays;
      const cutoff = Date.now() - windowDays * 86_400_000;
      const map = new Map<number, number>();
      for (const l of store.loot()) {
        if (l.discarded || l.excluded) continue;
        if (new Date(l.awardedAt).getTime() < cutoff) continue;
        map.set(l.characterId, (map.get(l.characterId) ?? 0) + 1);
      }
      return map;
    }),
  })),
  withComputed((store) => ({
    playerSummaries: computed<PlayerSummary[]>(() => {
      const overrides = store._settings.overrides();
      const settings = store._settings.settings();
      const recent = store.recentLootById();
      const loot = store.loot();
      const upgrades = store.upgrades();

      const repo = store.repoOverrides();
      return store.roster().map((character) => {
        const override = overrides[character.id];
        const levels = character.mplusDungeons ?? [];
        const qualifying = qualifyingRuns(levels, store.resolvedMplusMinLevel());
        const effort = effortScoreFor(levels, character.gear?.ilvlEquipped ?? null, {
          capRuns: settings.mplusCapRuns,
          minLevel: store.resolvedMplusMinLevel(),
          graduationIlvl: store.resolvedGraduationIlvl(),
        });
        const own = loot.filter((l) => l.characterId === character.id && !l.discarded);
        const lastLootAt = own.length
          ? own.reduce((a, b) => (a.awardedAt > b.awardedAt ? a : b)).awardedAt
          : null;
        const wishDates = upgrades
          .filter((u) => u.characterId === character.id && u.updatedAt)
          .map((u) => u.updatedAt!);
        if (character.droptimizerUploadedAt) wishDates.push(character.droptimizerUploadedAt);
        const activityStatus =
          override?.activity ?? repo.activity[character.name] ?? 'regular';
        return {
          character,
          activity: activityMultiplier(activityStatus, settings),
          activityStatus,
          activityOverridden: override?.activity != null,
          mplusRuns: qualifying,
          mplusTotalRuns: levels.length,
          effortScore: effort.score,
          effortGraduated: effort.graduated,
          recentLoot: recent.get(character.id) ?? 0,
          totalLoot: own.filter((l) => !l.excluded).length,
          lastLootAt,
          wishlistUpdatedAt: wishDates.length ? wishDates.sort().at(-1)! : null,
        };
      });
    }),
  })),
  withMethods((store) => ({
    async load(): Promise<void> {
      patchState(store, { status: 'loading', error: null });
      try {
        const get = <T>(file: string) =>
          firstValueFrom(store._http.get<T>(`data/${file}?t=${Date.now()}`));
        const [meta, roster, wishlists, lootHistory, attendance, repoOverrides] =
          await Promise.all([
            get<DataMeta>('meta.json'),
            get<RosterFile>('roster.json'),
            get<WishlistsFile>('wishlists.json'),
            get<LootHistoryFile>('loot-history.json'),
            get<AttendanceFile>('attendance.json'),
            // Optional file — a missing/broken overrides.json must not block the site.
            get<Partial<RepoOverrides>>('overrides.json').catch(
              (): Partial<RepoOverrides> => ({}),
            ),
          ]);
        patchState(store, {
          status: 'loaded',
          meta,
          roster: roster.characters,
          instances: wishlists.instances,
          upgrades: wishlists.upgrades,
          loot: lootHistory.items,
          attendance,
          repoOverrides: { activity: repoOverrides.activity ?? {} },
        });
      } catch (e) {
        patchState(store, {
          status: 'error',
          error: e instanceof Error ? e.message : 'Failed to load guild data',
        });
      }
    },

    /**
     * Ranks every player who simmed the item (plus, optionally, the rest of the
     * roster with S = 0) by their LPS for that drop.
     */
    candidatesFor(
      item: EncounterItem,
      difficulty: Difficulty,
      includeAllRoster: boolean,
      dropIlvlOverride: number | null = null,
      deltaOverrides: Record<number, number> = {},
    ): LootCandidate[] {
      const settings = store._settings.settings();
      const summaries = store.playerSummaries();
      const dropIlvl = dropIlvlOverride ?? settings.difficultyIlvl[difficulty];

      // Best wish per character for this item at this difficulty.
      const bestWish = new Map<number, WishUpgrade>();
      for (const u of store.upgrades()) {
        if (u.itemId !== item.id || u.difficulty !== difficulty) continue;
        const current = bestWish.get(u.characterId);
        if (!current || u.percentage > current.percentage) bestWish.set(u.characterId, u);
      }

      const rows: LootCandidate[] = [];
      for (const summary of summaries) {
        const wish = bestWish.get(summary.character.id) ?? null;
        if (!wish && !includeAllRoster) continue;

        const autoDelta = deltaIlvlForItem(summary.character.gear, item.slot, dropIlvl);
        const deltaIlvl = deltaOverrides[summary.character.id] ?? autoDelta;
        const zeroedByRole =
          settings.zeroSimForTanks && isTank(summary.character.role);
        // Stale droptimizers don't count — forces regular re-simming.
        const fresh = isSimFresh(wish?.updatedAt, settings.simMaxAgeDays);
        const simPercent = zeroedByRole || !fresh ? 0 : (wish?.percentage ?? 0);

        rows.push({
          character: summary.character,
          wish,
          deltaIlvl,
          breakdown: computeLps(
            {
              deltaIlvl: deltaIlvl ?? 0,
              simPercent,
              effortScore: summary.effortScore,
              recentLoot: summary.recentLoot,
              activity: summary.activity,
            },
            settings,
          ),
        });
      }
      return rows.sort((a, b) => b.breakdown.total - a.breakdown.total);
    },
  })),
  withHooks({
    onInit(store) {
      void store.load();
    },
  }),
);
