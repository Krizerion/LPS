import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SettingsStore } from '../../store/settings.store';
import { I18nStore } from '../../core/i18n';
import { computeLps } from '../../core/lps';

@Component({
  selector: 'app-rules',
  imports: [DecimalPipe],
  templateUrl: './rules.html',
  styleUrl: './rules.scss',
})
export class Rules {
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18nStore).t;

  /** The two worked examples from the guild rules, recomputed with live weights. */
  protected readonly examples = [
    {
      key: 'example1' as const,
      input: { deltaIlvl: 5, simPercent: 1.0, effortScore: 10, recentLoot: 0, activity: 1.0 },
    },
    {
      key: 'example2' as const,
      input: { deltaIlvl: 8, simPercent: 1.1, effortScore: 0, recentLoot: 0, activity: 1.0 },
    },
  ];

  protected result(input: (typeof this.examples)[number]['input']) {
    return computeLps(input, this.settings.settings());
  }

  protected exampleTitle(key: 'example1' | 'example2'): string {
    return key === 'example1' ? this.t().rules.example1Title : this.t().rules.example2Title;
  }

  protected exampleNote(key: 'example1' | 'example2'): string {
    return key === 'example1' ? this.t().rules.example1Note : this.t().rules.example2Note;
  }
}
