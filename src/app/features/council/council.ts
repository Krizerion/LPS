import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GuildStore } from '../../store/guild.store';
import { SettingsStore } from '../../store/settings.store';
import { Difficulty, EncounterItem } from '../../core/models';
import { classColor, ROLE_ICONS, slotLabel, timeAgo, wowheadUrl } from '../../shared/wow';

@Component({
  selector: 'app-council',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './council.html',
  styleUrl: './council.scss',
})
export class Council {
  protected readonly guild = inject(GuildStore);
  protected readonly settings = inject(SettingsStore);

  protected readonly instanceId = signal<number | null>(null);
  protected readonly encounterName = signal<string | null>(null);
  protected readonly selectedItem = signal<EncounterItem | null>(null);
  protected readonly difficulty = signal<Difficulty>('mythic');
  protected readonly includeAllRoster = signal(false);
  protected readonly dropIlvlOverride = signal<number | null>(null);
  /** Manual ΔI tweaks per character id for the currently selected item. */
  protected readonly deltaOverrides = signal<Record<number, number>>({});

  protected readonly classColor = classColor;
  protected readonly roleIcons = ROLE_ICONS;
  protected readonly slotLabel = slotLabel;
  protected readonly timeAgo = timeAgo;
  protected readonly wowheadUrl = wowheadUrl;

  constructor() {
    // Default to the first instance/encounter once data arrives.
    effect(() => {
      const instances = this.guild.instances();
      if (instances.length && this.instanceId() === null) {
        this.instanceId.set(instances[0].id);
        this.encounterName.set(instances[0].encounters[0]?.name ?? null);
      }
    });
  }

  protected readonly instance = computed(
    () => this.guild.instances().find((i) => i.id === this.instanceId()) ?? null,
  );

  protected readonly encounter = computed(
    () => this.instance()?.encounters.find((e) => e.name === this.encounterName()) ?? null,
  );

  /** Difficulty steps are 13 ilvls apart (track cutoffs), counting down from mythic. */
  private static readonly DIFFICULTY_OFFSET: Record<Difficulty, number> = {
    mythic: 0,
    heroic: 13,
    normal: 26,
  };

  protected readonly dropIlvl = computed(() => {
    const override = this.dropIlvlOverride();
    if (override != null) return override;
    const difficulty = this.difficulty();
    // Per-boss max ilvl (bosses deeper in the raid drop higher) beats season/settings defaults.
    const bossMax = this.encounter()?.maxItemLevel;
    if (bossMax != null) return bossMax - Council.DIFFICULTY_OFFSET[difficulty];
    return (
      this.guild.meta()?.seasonIlvls?.[difficulty] ??
      this.settings.settings().difficultyIlvl[difficulty]
    );
  });

  protected readonly candidates = computed(() => {
    const item = this.selectedItem();
    if (!item) return [];
    return this.guild.candidatesFor(
      item,
      this.difficulty(),
      this.includeAllRoster(),
      this.dropIlvl(),
      this.deltaOverrides(),
    );
  });

  protected isTierItem(item: EncounterItem): boolean {
    const meta = this.guild.meta();
    return (
      (meta?.tierItemIds?.includes(item.id) ?? false) ||
      (!!meta?.omnitokenName && item.name === meta.omnitokenName)
    );
  }

  protected readonly maxLps = computed(() =>
    Math.max(1, ...this.candidates().map((c) => c.breakdown.total)),
  );

  protected selectEncounter(name: string): void {
    this.encounterName.set(name);
    this.selectedItem.set(null);
    this.deltaOverrides.set({});
  }

  protected selectItem(item: EncounterItem): void {
    this.selectedItem.set(item);
    this.deltaOverrides.set({});
  }

  protected setDifficulty(d: Difficulty): void {
    this.difficulty.set(d);
    this.dropIlvlOverride.set(null);
    this.deltaOverrides.set({});
  }

  protected setDelta(characterId: number, value: string): void {
    const parsed = Number(value);
    this.deltaOverrides.update((overrides) => {
      const next = { ...overrides };
      if (value === '' || Number.isNaN(parsed)) delete next[characterId];
      else next[characterId] = Math.max(0, parsed);
      return next;
    });
  }

  protected wishStale(updatedAt: string | null): boolean {
    return !updatedAt || Date.now() - new Date(updatedAt).getTime() > 14 * 86_400_000;
  }
}
