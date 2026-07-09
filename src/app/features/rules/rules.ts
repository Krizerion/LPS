import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SettingsStore } from '../../store/settings.store';
import { computeLps } from '../../core/lps';

@Component({
  selector: 'app-rules',
  imports: [DecimalPipe],
  templateUrl: './rules.html',
  styleUrl: './rules.scss',
})
export class Rules {
  protected readonly settings = inject(SettingsStore);

  /** The two worked examples from the guild rules, recomputed with live weights. */
  protected readonly examples = [
    {
      title: 'Играч 1 — The M+ Grinder',
      note: 'Фармил е M+ цяла седмица — малък ъпгрейд, но перфектни енчанти.',
      input: { deltaIlvl: 5, simPercent: 1.0, enchantScore: 10, recentLoot: 0, activity: 1.0 },
    },
    {
      title: 'Играч 2 — Raid-Logger',
      note: 'Влиза само за рейда — огромен ъпгрейд, но нула инвестиция.',
      input: { deltaIlvl: 25, simPercent: 2.5, enchantScore: 0, recentLoot: 0, activity: 1.0 },
    },
  ];

  protected result(input: (typeof this.examples)[number]['input']) {
    return computeLps(input, this.settings.settings().weights);
  }
}
