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
  enchantScoreFromGear,
  isTankOrHealer,
  LpsBreakdown,
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
  attendancePct: number | null;
  activity: number;
  activityStatus: 'regular' | 'casual';
  /** True when set from this browser (localStorage) rather than overrides.json. */
  activityOverridden: boolean;
  enchantScore: number | null;
  enchantOverridden: boolean;
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
  repoOverrides: { activity: {}, enchantScore: {} },
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
    attendanceById: computed(() => {
      const map = new Map<number, number>();
      for (const a of store.attendance()?.characters ?? []) {
        map.set(a.characterId, a.attendedPercentage);
      }
      return map;
    }),
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
        const attendancePct = store.attendanceById().get(character.id) ?? null;
        const gearScore = enchantScoreFromGear(character.gear);
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
          attendancePct,
          activity: activityMultiplier(activityStatus, settings),
          activityStatus,
          activityOverridden: override?.activity != null,
          enchantScore:
            override?.enchantScore ?? repo.enchantScore[character.name] ?? gearScore,
          enchantOverridden: override?.enchantScore != null,
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
          repoOverrides: {
            activity: repoOverrides.activity ?? {},
            enchantScore: repoOverrides.enchantScore ?? {},
          },
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
        const simPercent =
          settings.zeroSimForTanksHealers && isTankOrHealer(summary.character.role)
            ? 0
            : (wish?.percentage ?? 0);

        rows.push({
          character: summary.character,
          wish,
          deltaIlvl,
          breakdown: computeLps(
            {
              deltaIlvl: deltaIlvl ?? 0,
              simPercent,
              enchantScore: summary.enchantScore ?? 0,
              recentLoot: summary.recentLoot,
              activity: summary.activity,
            },
            settings.weights,
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
