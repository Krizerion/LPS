import { effect } from '@angular/core';
import { getState, patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { DEFAULT_SETTINGS, LpsSettings } from '../core/lps';
import { CharacterOverride } from '../core/models';

// v2: E weight 2.5→2.0, casual 0.7→0.75, attendance threshold removed.
const STORAGE_KEY = 'lps.settings.v2';

/** GitHub connection for the manual "refresh data" button (token never leaves this browser). */
export interface GithubConfig {
  repo: string;
  token: string;
}

const DEFAULT_GITHUB: GithubConfig = { repo: 'Krizerion/LPS', token: '' };

interface SettingsState {
  settings: LpsSettings;
  /** Manual per-character overrides, keyed by character id. */
  overrides: Record<number, CharacterOverride>;
  github: GithubConfig;
}

function initialState(): SettingsState {
  const fallback: SettingsState = {
    settings: structuredClone(DEFAULT_SETTINGS),
    overrides: {},
    github: { ...DEFAULT_GITHUB },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return {
      settings: {
        ...fallback.settings,
        ...parsed.settings,
        weights: { ...fallback.settings.weights, ...parsed.settings?.weights },
        difficultyIlvl: {
          ...fallback.settings.difficultyIlvl,
          ...parsed.settings?.difficultyIlvl,
        },
      },
      overrides: parsed.overrides ?? {},
      github: { ...fallback.github, ...parsed.github },
    };
  } catch {
    return fallback;
  }
}

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>(initialState),
  withMethods((store) => ({
    updateSettings(patch: Partial<LpsSettings>): void {
      patchState(store, (state) => ({
        settings: {
          ...state.settings,
          ...patch,
          weights: { ...state.settings.weights, ...patch.weights },
          difficultyIlvl: { ...state.settings.difficultyIlvl, ...patch.difficultyIlvl },
        },
      }));
    },
    setOverride(characterId: number, patch: CharacterOverride): void {
      patchState(store, (state) => {
        const merged = { ...state.overrides[characterId], ...patch };
        const overrides = { ...state.overrides, [characterId]: merged };
        if (merged.enchantScore == null && merged.activity == null) {
          delete overrides[characterId];
        }
        return { overrides };
      });
    },
    updateGithub(patch: Partial<GithubConfig>): void {
      patchState(store, (state) => ({ github: { ...state.github, ...patch } }));
    },
    resetSettings(): void {
      patchState(store, { settings: structuredClone(DEFAULT_SETTINGS) });
    },
    clearOverrides(): void {
      patchState(store, { overrides: {} });
    },
  })),
  withHooks({
    onInit(store) {
      effect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getState(store)));
      });
    },
  }),
);
