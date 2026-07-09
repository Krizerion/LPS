import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GuildStore } from '../../store/guild.store';
import { SettingsStore } from '../../store/settings.store';
import { classColor, slotLabel, wowheadUrl } from '../../shared/wow';

@Component({
  selector: 'app-history',
  imports: [FormsModule, DatePipe],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History {
  protected readonly guild = inject(GuildStore);
  protected readonly settings = inject(SettingsStore);

  protected readonly playerFilter = signal<number | null>(null);
  protected readonly onlyCounted = signal(false);

  protected readonly classColor = classColor;
  protected readonly slotLabel = slotLabel;
  protected readonly wowheadUrl = wowheadUrl;

  protected readonly rows = computed(() => {
    const player = this.playerFilter();
    const onlyCounted = this.onlyCounted();
    return this.guild
      .loot()
      .filter((l) => !l.discarded)
      .filter((l) => player === null || l.characterId === player)
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
