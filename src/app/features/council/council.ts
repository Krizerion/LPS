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

  protected readonly dropIlvl = computed(
    () =>
      this.dropIlvlOverride() ?? this.settings.settings().difficultyIlvl[this.difficulty()],
  );

  protected readonly candidates = computed(() => {
    const item = this.selectedItem();
    if (!item) return [];
    return this.guild.candidatesFor(
      item,
      this.difficulty(),
      this.includeAllRoster(),
      this.dropIlvlOverride(),
      this.deltaOverrides(),
    );
  });

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
