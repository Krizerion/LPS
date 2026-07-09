import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GuildStore, PlayerSummary } from '../../store/guild.store';
import { SettingsStore } from '../../store/settings.store';
import { I18nStore, timeAgoI18n } from '../../core/i18n';
import { classColor, ROLE_ICONS } from '../../shared/wow';

type SortKey = 'name' | 'ilvl' | 'enchant' | 'recentLoot' | 'wishlist';

@Component({
  selector: 'app-standings',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './standings.html',
  styleUrl: './standings.scss',
})
export class Standings {
  protected readonly guild = inject(GuildStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18nStore).t;

  protected readonly search = signal('');
  protected readonly sortKey = signal<SortKey>('name');
  protected readonly sortDesc = signal(false);
  protected readonly editingEnchant = signal<number | null>(null);

  protected readonly classColor = classColor;
  protected readonly roleIcons = ROLE_ICONS;

  protected timeAgo(iso: string | null): string {
    return timeAgoI18n(iso, this.t());
  }

  protected readonly rows = computed(() => {
    const term = this.search().toLowerCase().trim();
    const key = this.sortKey();
    const dir = this.sortDesc() ? -1 : 1;
    const value = (r: PlayerSummary): string | number => {
      switch (key) {
        case 'ilvl':
          return r.character.gear?.ilvlEquipped ?? 0;
        case 'enchant':
          return r.enchantScore ?? -1;
        case 'recentLoot':
          return r.recentLoot;
        case 'wishlist':
          return r.wishlistUpdatedAt ?? '';
        default:
          return r.character.name;
      }
    };
    return this.guild
      .playerSummaries()
      .filter((r) => !term || r.character.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number);
        return cmp * dir;
      });
  });

  protected readonly stats = computed(() => {
    const rows = this.guild.playerSummaries();
    const staleWishlists = rows.filter(
      (r) =>
        !r.wishlistUpdatedAt ||
        Date.now() - new Date(r.wishlistUpdatedAt).getTime() > 14 * 86_400_000,
    ).length;
    return {
      rosterSize: rows.length,
      casualCount: rows.filter((r) => r.activityStatus === 'casual').length,
      recentLoot: rows.reduce((sum, r) => sum + r.recentLoot, 0),
      staleWishlists,
    };
  });

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDesc.update((v) => !v);
    } else {
      this.sortKey.set(key);
      this.sortDesc.set(key !== 'name');
    }
  }

  /** Toggles the status in this browser (on top of the committed overrides.json). */
  protected toggleActivity(row: PlayerSummary): void {
    const next = row.activityStatus === 'regular' ? 'casual' : 'regular';
    const repoDefault =
      this.guild.repoOverrides().activity[row.character.name] ?? 'regular';
    // Toggling back to the committed value clears the local override entirely.
    this.settings.setOverride(row.character.id, {
      activity: next === repoDefault ? null : next,
    });
  }

  protected setEnchantOverride(row: PlayerSummary, value: string): void {
    const parsed = value === '' ? null : Math.max(0, Math.min(10, Number(value)));
    this.settings.setOverride(row.character.id, {
      enchantScore: parsed == null || Number.isNaN(parsed) ? null : parsed,
    });
    this.editingEnchant.set(null);
  }

  protected wishlistStale(row: PlayerSummary): boolean {
    return (
      !row.wishlistUpdatedAt ||
      Date.now() - new Date(row.wishlistUpdatedAt).getTime() > 14 * 86_400_000
    );
  }
}
