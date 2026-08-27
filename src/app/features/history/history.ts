import { afterRenderEffect, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GuildStore } from '../../store/guild.store';
import { SettingsStore } from '../../store/settings.store';
import { I18nStore } from '../../core/i18n';
import { classColor, iconUrl, refreshWowheadLinks, slotLabel, wowheadUrl } from '../../shared/wow';

/** Filter bucket for awards whose item isn't part of any known encounter (crafted, M+, old season). */
const OTHER_BOSS = '__other__';

const DIFFICULTY_ORDER = ['Mythic', 'Heroic', 'Normal', 'Raid Finder', 'LFR'];

@Component({
  selector: 'app-history',
  imports: [FormsModule, DatePipe],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History {
  protected readonly guild = inject(GuildStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18nStore).t;

  protected readonly search = signal('');
  protected readonly playerFilter = signal<number | null>(null);
  protected readonly bossFilter = signal<string | null>(null);
  protected readonly difficultyFilter = signal<string | null>(null);
  protected readonly responseFilter = signal<string | null>(null);
  protected readonly onlyCounted = signal(false);

  protected readonly otherBoss = OTHER_BOSS;

  protected readonly classColor = classColor;
  protected readonly slotLabel = slotLabel;
  protected readonly wowheadUrl = wowheadUrl;
  protected readonly iconUrl = iconUrl;

  constructor() {
    afterRenderEffect(() => {
      this.rows();
      refreshWowheadLinks();
    });
  }

  /** Awards that were actually handed out (RCLootCouncil "discarded" rows are never shown). */
  private readonly awarded = computed(() => this.guild.loot().filter((l) => !l.discarded));

  private readonly bossByItemId = computed(() => {
    const map = new Map<number, string>();
    for (const inst of this.guild.instances()) {
      for (const enc of inst.encounters) {
        for (const item of enc.items) {
          if (!map.has(item.id)) map.set(item.id, enc.name);
        }
      }
    }
    return map;
  });

  protected bossOf(itemId: number): string | null {
    return this.bossByItemId().get(itemId) ?? null;
  }

  /** Bosses that have awarded loot, in raid order; OTHER_BOSS last when present. */
  protected readonly bossOptions = computed(() => {
    const present = new Set(
      this.awarded().map((l) => this.bossByItemId().get(l.itemId) ?? OTHER_BOSS),
    );
    const ordered: string[] = [];
    for (const inst of this.guild.instances()) {
      for (const enc of inst.encounters) {
        if (present.has(enc.name)) ordered.push(enc.name);
      }
    }
    if (present.has(OTHER_BOSS)) ordered.push(OTHER_BOSS);
    return ordered;
  });

  protected readonly difficultyOptions = computed(() =>
    [...new Set(this.awarded().map((l) => l.difficulty))].sort((a, b) => {
      const ai = DIFFICULTY_ORDER.indexOf(a);
      const bi = DIFFICULTY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    }),
  );

  protected readonly responseOptions = computed(() =>
    [...new Set(this.awarded().flatMap((l) => (l.response ? [l.response] : [])))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  protected readonly hasFilters = computed(
    () =>
      this.search().trim() !== '' ||
      this.playerFilter() !== null ||
      this.bossFilter() !== null ||
      this.difficultyFilter() !== null ||
      this.responseFilter() !== null ||
      this.onlyCounted(),
  );

  protected clearFilters(): void {
    this.search.set('');
    this.playerFilter.set(null);
    this.bossFilter.set(null);
    this.difficultyFilter.set(null);
    this.responseFilter.set(null);
    this.onlyCounted.set(false);
  }

  protected readonly rows = computed(() => {
    const term = this.search().toLowerCase().trim();
    const player = this.playerFilter();
    const boss = this.bossFilter();
    const difficulty = this.difficultyFilter();
    const response = this.responseFilter();
    const onlyCounted = this.onlyCounted();
    return this.awarded()
      .filter((l) => player === null || l.characterId === player)
      .filter((l) => boss === null || (this.bossOf(l.itemId) ?? OTHER_BOSS) === boss)
      .filter((l) => difficulty === null || l.difficulty === difficulty)
      .filter((l) => response === null || l.response === response)
      .filter(
        (l) =>
          !term ||
          l.name.toLowerCase().includes(term) ||
          this.characterName(l.characterId).toLowerCase().includes(term),
      )
      .filter((l) => !onlyCounted || !l.excluded)
      .slice()
      .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
  });

  protected readonly windowCutoff = computed(
    () => Date.now() - this.settings.settings().lootWindowDays * 86_400_000,
  );

  protected inWindow(awardedAt: string): boolean {
    return new Date(awardedAt).getTime() >= this.windowCutoff();
  }

  protected characterName(id: number): string {
    return this.guild.charactersById().get(id)?.name ?? `#${id}`;
  }

  protected characterClass(id: number): string {
    return this.guild.charactersById().get(id)?.class ?? '';
  }
}
