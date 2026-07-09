import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GuildStore } from './store/guild.store';
import { SettingsStore } from './store/settings.store';
import { I18nStore, timeAgoI18n } from './core/i18n';

type RefreshState = 'idle' | 'starting' | 'waiting' | 'done' | 'error';

/** How long to poll for the refreshed snapshot before giving up (~ fetch + deploy time). */
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 12 * 60_000;

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
  protected readonly refreshState = signal<RefreshState>('idle');

  protected timeAgo(iso: string | null): string {
    return timeAgoI18n(iso, this.t());
  }

  protected patch(patch: Parameters<typeof this.settingsStore.updateSettings>[0]): void {
    this.settingsStore.updateSettings(patch);
  }

  /**
   * Kicks off the "Refresh guild data" GitHub workflow, then polls the
   * deployed meta.json until the new snapshot is live and reloads the data.
   */
  protected async triggerRefresh(): Promise<void> {
    const { repo, token } = this.settingsStore.github();
    if (!repo || !token) {
      this.settingsOpen.set(true);
      return;
    }
    if (this.refreshState() === 'starting' || this.refreshState() === 'waiting') return;

    this.refreshState.set('starting');
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/refresh-data.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main' }),
        },
      );
      if (res.status !== 204) {
        this.refreshState.set('error');
        return;
      }
    } catch {
      this.refreshState.set('error');
      return;
    }

    this.refreshState.set('waiting');
    const before = this.guild.meta()?.fetchedAt ?? null;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const poll = async (): Promise<void> => {
      if (Date.now() > deadline) {
        this.refreshState.set('error');
        return;
      }
      try {
        const meta = await (await fetch(`data/meta.json?t=${Date.now()}`)).json();
        if (meta.fetchedAt && meta.fetchedAt !== before) {
          await this.guild.load();
          this.refreshState.set('done');
          setTimeout(() => this.refreshState.set('idle'), 8_000);
          return;
        }
      } catch {
        // transient fetch error while the deploy swaps files — keep polling
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    setTimeout(poll, POLL_INTERVAL_MS);
  }
}
