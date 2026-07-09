import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GuildStore } from './store/guild.store';
import { SettingsStore } from './store/settings.store';
import { I18nStore, timeAgoI18n } from './core/i18n';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly guild = inject(GuildStore);
  protected readonly settingsStore = inject(SettingsStore);
  protected readonly i18n = inject(I18nStore);
  protected readonly t = this.i18n.t;
  protected readonly settingsOpen = signal(false);

  protected timeAgo(iso: string | null): string {
    return timeAgoI18n(iso, this.t());
  }

  protected patch(patch: Parameters<typeof this.settingsStore.updateSettings>[0]): void {
    this.settingsStore.updateSettings(patch);
  }
}
