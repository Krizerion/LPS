import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

export type Lang = 'bg' | 'en';

const LANG_KEY = 'lps.lang';

/** English dictionary — the source of truth for the Strings type. */
const en = {
  common: {
    appSubtitle: 'Loot Priority Score',
    dataAgo: (ago: string) => `data ${ago}`,
    settingsTitle: 'LPS settings',
    loadErrorTitle: 'Could not load guild data',
    retry: 'Retry',
    loading: 'Loading guild data…',
    regular: 'Regular',
    casual: 'Casual',
    never: 'never',
    justNow: 'just now',
    daysAgo: (n: number) => `${n}d ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    monthsAgo: (n: number) => `${n}mo ago`,
  },
  nav: {
    standings: 'Standings',
    council: 'Loot Council',
    history: 'History',
    rules: 'Rules',
  },
  refresh: {
    tooltip: 'Fetch fresh data from wowaudit now (needs a GitHub token in settings)',
    starting: 'starting…',
    waiting: 'refreshing… ~2–3 min',
    done: 'data updated',
    error: 'refresh failed',
  },
  roles: {
    Tank: 'Tank',
    Heal: 'Heal',
    Melee: 'Melee',
    Ranged: 'Ranged',
  } as Record<string, string>,
  settings: {
    title: 'LPS Settings',
    weights: 'Weights',
    deltaIlvl: 'Item level difference (ΔI)',
    simPercent: 'Sim upgrade % (S)',
    simMaxAge: 'Max sim age (days, older → S = 0)',
    effortSection: 'M+ effort factor (F)',
    effortFloor: 'F at zero keys',
    mplusCap: 'Keys for full effort (2 resets)',
    mplusMinLevel: 'Minimum key level (empty = auto)',
    graduationIlvl: 'Graduation ilvl (geared → F = 1.0, empty = auto)',
    rollThreshold: 'Roll-off threshold (%)',
    autoValue: (v: number) => `auto: ${v}`,
    lootActivity: 'Recent loot & activity',
    lootWindow: 'Loot window (days)',
    casualMultiplier: 'Casual multiplier',
    zeroSim: 'Zero sim for tanks (healers included)',
    dropIlvls: 'Fallback drop item level per difficulty',
    normal: 'Normal',
    heroic: 'Heroic',
    mythic: 'Mythic',
    formulaNote: (casual: string | null) =>
      `divided by (1 + L), times A and the effort factor F; casual A = ${casual},`,
    githubSection: 'Manual data refresh (GitHub)',
    githubRepo: 'Repository',
    githubToken: 'Access token',
    githubHint:
      'The ⟳ button triggers the refresh workflow via the GitHub API. Create a fine-grained token with read & write access to Actions for this repository only — it is stored solely in this browser:',
    clearOverrides: 'Clear player overrides',
    reset: 'Reset to defaults',
  },
  standings: {
    title: 'Standings',
    sub: 'Everything that feeds the formula per player. Status (A) is a council decision — click it to toggle in this browser, or edit public/data/overrides.json to set it for everyone. M+ effort counts qualifying keys over the last two resets; the cap earns 100%.',
    rosterSize: 'Raiders tracked',
    casualCount: 'Marked casual',
    recentLoot: 'Items in loot window',
    staleWishlists: 'Stale droptimizers (>14d)',
    search: 'Search player…',
    colPlayer: 'Player',
    colRole: 'Role',
    colIlvl: 'ilvl',
    colStatus: 'Status (A)',
    colEffort: 'M+ effort (M)',
    colRecentLoot: 'Recent loot (L)',
    colLootTotal: 'Loot total',
    colDroptimizer: 'Droptimizer',
    statusTooltip: 'Council decision — click to toggle in this browser (● = local override)',
    effortTooltip: (minLevel: number, cap: number) =>
      `Keys ≥${minLevel} over the last two weekly resets; ${cap}+ keys = 100%`,
    graduated: 'M+ done',
    graduatedTooltip:
      'Equipped ilvl is past the graduation threshold — M+ no longer provides upgrades, so full effort factor applies without running keys',
    runsLabel: (n: number) => `${n} ${n === 1 ? 'key' : 'keys'}`,
    localOverride: 'Local override (this browser only)',
    noMatch: 'No players match.',
  },
  council: {
    title: 'Loot Council',
    sub: 'Pick the boss and the item that dropped — players are ranked by their Loot Priority Score.',
    drops: (boss: string) => `${boss} — drops`,
    noItems:
      'No items known for this boss yet — they appear once someone uploads a droptimizer report that includes it.',
    dropIlvl: 'Drop ilvl',
    showAll: 'Show players without sims',
    tier: 'Tier',
    tierReminder:
      '⚠ Tier piece — players completing their 2p/4p set bonus have priority before the formula applies (see Rules).',
    colDeltaTooltip: 'Item level difference — editable',
    colSimTooltip: 'Droptimizer upgrade %',
    colEffortTooltip: 'M+ effort factor (F): floor at zero keys, ×1.00 at the cap',
    colLootTooltip: 'Recent loot count',
    colActivityTooltip: 'Activity multiplier',
    staleSim: 'stale sim',
    staleSimTooltip: 'Droptimizer too old — S counts as 0 until a fresh report is uploaded',
    edited: 'edited',
    editedTooltip: 'This wish value was manually edited, not produced by a droptimizer report',
    noSim: 'no sim',
    rollCall: (names: string, pct: number) =>
      `Close call (within ${pct}%) — roll it off between: ${names}`,
    deltaUnknown: 'Equipped item level unknown — set manually',
    deltaAuto: 'Auto from equipped gear, editable',
    emptyCandidates: (difficulty: string) =>
      `Nobody has simmed this item on ${difficulty}. Toggle “show players without sims” to rank the whole roster.`,
    legendSuffix:
      '— divided by (1 + L), times A and the M+ effort factor F. Tier tokens: complete 2p/4p first (see Rules).',
    selectHint: 'Select an item to rank candidates.',
    ilvlComponent: 'ΔI component',
    simComponent: 'Sim component',
  },
  history: {
    title: 'Loot History',
    sub: (days: number) =>
      `Awards synced from wowaudit. Rows inside the current ${days}-day window count towards the L penalty.`,
    allPlayers: 'All players',
    hideExcluded: 'Hide offspec / excluded',
    awards: (n: number) => `${n} awards`,
    colDate: 'Date',
    colItem: 'Item',
    colSlot: 'Slot',
    colPlayer: 'Player',
    colDifficulty: 'Difficulty',
    colResponse: 'Response',
    colCounts: 'Counts for L',
    inWindow: 'in window',
    expired: 'expired',
    no: 'no',
    empty: 'No loot recorded yet.',
  },
  rules: {
    title: 'WoW S2 Loot Priority Score (LPS)',
    sub: 'Rules and formula for fair loot distribution.',
    formulaTitle: 'The formula',
    formulaNote:
      'Weights are read live from the settings (⚙) — changes there are reflected here and in the Loot Council calculations.',
    varsTitle: 'Variables and weights — the "anti-lazy" system',
    colVariable: 'Variable',
    colMeaning: 'Meaning',
    colWeight: 'Weight',
    deltaName: 'ΔI — item level difference',
    deltaDesc:
      'The raw difference between the new item and the old one. Reduced weight, so items are not gifted to people who do not farm Mythic+.',
    simName: 'S — sim upgrade %',
    simDesc:
      'The throughput increase from a droptimizer (Raidbots) or QELive (healers). Only tanks are excluded (their sims aren\'t comparable) — healers compete on their sim. The main factor for guild progress.',
    effortName: 'F — M+ effort factor',
    effortDesc: (minLevel: number, cap: number) =>
      `A multiplier on the whole score, from the effort score M (0–10): keys at level ${minLevel}+ over the last two weekly resets count, ${cap} keys or more = M 10 → F ×1.00; zero keys → the floor. Players geared past the graduation ilvl count as full effort — M+ no longer upgrades them, so stopping keys is not laziness. Effort modulates need instead of replacing it: nobody wins an item they don't need just by farming, but between comparable upgrades the invested player always wins. (Full enchants and gems are assumed — they are not scored.)`,
    lootName: 'L — recent loot',
    lootDesc: (days: number) =>
      `The number of items received in the last ${days} days. Prevents greed and gears the raid evenly.`,
    activityName: 'A — status / activity',
    activityDescRegular: '— regular/active: shows up to raid and unlocks Vault slots.',
    activityDescCasual: (penalty: string | null) =>
      `— irregular/casual: raid-logger, trials, or frequent absences (${penalty}% penalty). Set by the loot council.`,
    weightMultiplier: 'multiplier',
    exceptionsTitle: 'Exceptions (Hard Reserves)',
    exception1Bold: 'Tier sets:',
    exception1:
      'tokens go first to players who complete their 2-piece or 4-piece set bonus with them, before the formula applies to everyone else.',
    exception2Bold: 'Extreme BiS items:',
    exception2:
      'very rare weapons or unique trinkets are discussed only among the classes for which they are absolutely Best-in-Slot.',
    exampleTitle: 'Worked example',
    exampleSub:
      'An item drops. Neither player has recent loot (L = 0) and both are "Regular" (A = 1.0).',
    example1Title: 'Player 1 — The M+ Grinder',
    example1Note: 'Farms keys every week — slightly smaller upgrade, full effort factor (F = 1.00).',
    example2Title: 'Player 2 — Raid-Logger',
    example2Note: 'Only logs in for raid — even a slightly bigger upgrade, but zero keys (F = 0.70).',
    points: 'pts',
    conclusionBold: 'Conclusion:',
    conclusion:
      'The grinder wins the close call — the raid-logger pays a 30% effort tax on everything. But effort only tips the scales: with a truly huge need difference (say 2.5% vs 0.3% sim) the item still goes where it helps the raid most, taxed but not blocked.',
  },
};

export type Strings = typeof en;

const bg: Strings = {
  common: {
    appSubtitle: 'Loot Priority Score',
    dataAgo: (ago: string) => `данни ${ago}`,
    settingsTitle: 'LPS настройки',
    loadErrorTitle: 'Данните на гилдията не можаха да се заредят',
    retry: 'Опитай пак',
    loading: 'Зареждане на данните…',
    regular: 'Редовен',
    casual: 'Нередовен',
    never: 'никога',
    justNow: 'току-що',
    daysAgo: (n: number) => `преди ${n}д`,
    hoursAgo: (n: number) => `преди ${n}ч`,
    monthsAgo: (n: number) => `преди ${n} мес.`,
  },
  nav: {
    standings: 'Класиране',
    council: 'Loot Council',
    history: 'История',
    rules: 'Правила',
  },
  refresh: {
    tooltip: 'Изтегли свежи данни от wowaudit сега (изисква GitHub токен в настройките)',
    starting: 'стартиране…',
    waiting: 'обновяване… ~2–3 мин',
    done: 'данните са обновени',
    error: 'неуспешно обновяване',
  },
  roles: {
    Tank: 'Танк',
    Heal: 'Хийлър',
    Melee: 'Melee',
    Ranged: 'Ranged',
  } as Record<string, string>,
  settings: {
    title: 'LPS Настройки',
    weights: 'Тежести',
    deltaIlvl: 'Разлика в Item Level (ΔI)',
    simPercent: 'Sim ъпгрейд % (S)',
    simMaxAge: 'Макс. възраст на sim (дни, по-стар → S = 0)',
    effortSection: 'M+ ефорт фактор (F)',
    effortFloor: 'F при нула ключове',
    mplusCap: 'Ключове за пълен ефорт (2 reset-а)',
    mplusMinLevel: 'Минимално ниво на ключ (празно = авто)',
    graduationIlvl: 'Ilvl праг „M+ готов“ (F = 1.0, празно = авто)',
    rollThreshold: 'Праг за roll (%)',
    autoValue: (v: number) => `авто: ${v}`,
    lootActivity: 'Скорошен луут и активност',
    lootWindow: 'Луут прозорец (дни)',
    casualMultiplier: 'Множител за Нередовен',
    zeroSim: 'Нулев sim за танкове (хийлърите се броят)',
    dropIlvls: 'Резервен drop ilvl по трудност',
    normal: 'Normal',
    heroic: 'Heroic',
    mythic: 'Mythic',
    formulaNote: (casual: string | null) =>
      `делено на (1 + L), по A и ефорт фактора F; Нередовен A = ${casual},`,
    githubSection: 'Ръчно обновяване на данните (GitHub)',
    githubRepo: 'Хранилище',
    githubToken: 'Токен за достъп',
    githubHint:
      'Бутонът ⟳ стартира refresh workflow-а през GitHub API. Създай fine-grained токен с read & write достъп само до Actions на това хранилище — пази се само в този браузър:',
    clearOverrides: 'Изчисти ръчните корекции',
    reset: 'Върни по подразбиране',
  },
  standings: {
    title: 'Класиране',
    sub: 'Всичко, което влиза във формулата, за всеки играч. Статусът (A) е решение на съвета — кликни го за смяна в този браузър или редактирай public/data/overrides.json, за да важи за всички. M+ ефортът брои качествените ключове за последните два reset-а; таванът дава 100%.',
    rosterSize: 'Проследени рейдъри',
    casualCount: 'Нередовни играчи',
    recentLoot: 'Предмети в луут прозореца',
    staleWishlists: 'Остарели droptimizer-и (>14д)',
    search: 'Търси играч…',
    colPlayer: 'Играч',
    colRole: 'Роля',
    colIlvl: 'ilvl',
    colStatus: 'Статус (A)',
    colEffort: 'M+ ефорт (M)',
    colRecentLoot: 'Скорошен луут (L)',
    colLootTotal: 'Общо луут',
    colDroptimizer: 'Droptimizer',
    statusTooltip: 'Решение на съвета — кликни за смяна в този браузър (● = локална корекция)',
    effortTooltip: (minLevel: number, cap: number) =>
      `Ключове ≥${minLevel} за последните два седмични reset-а; ${cap}+ ключа = 100%`,
    graduated: 'M+ готов',
    graduatedTooltip:
      'Ilvl-ът е над прага — M+ вече не дава ъпгрейди, затова пълният ефорт фактор важи и без ключове',
    runsLabel: (n: number) => `${n} ${n === 1 ? 'ключ' : 'ключа'}`,
    localOverride: 'Локална корекция (само този браузър)',
    noMatch: 'Няма съвпадащи играчи.',
  },
  council: {
    title: 'Loot Council',
    sub: 'Избери боса и падналия предмет — играчите се подреждат по техния Loot Priority Score.',
    drops: (boss: string) => `${boss} — предмети`,
    noItems:
      'Все още няма предмети за този бос — появяват се, щом някой качи droptimizer, който го включва.',
    dropIlvl: 'Ilvl на дропа',
    showAll: 'Покажи играчи без sim',
    tier: 'Тир',
    tierReminder:
      '⚠ Тир предмет — играчи, които завършват 2p/4p сет бонус, имат приоритет преди формулата (виж Правила).',
    colDeltaTooltip: 'Разлика в item level — може да се редактира',
    colSimTooltip: 'Droptimizer ъпгрейд %',
    colEffortTooltip: 'M+ ефорт фактор (F): минимумът при нула ключове, ×1.00 при тавана',
    colLootTooltip: 'Брой скорошен луут',
    colActivityTooltip: 'Множител за активност',
    staleSim: 'стар sim',
    staleSimTooltip: 'Droptimizer-ът е твърде стар — S се брои за 0, докато не се качи нов',
    edited: 'редактиран',
    editedTooltip: 'Тази стойност е въведена ръчно, не идва от droptimizer репорт',
    noSim: 'без sim',
    rollCall: (names: string, pct: number) =>
      `Много близки резултати (в рамките на ${pct}%) — ролнете си: ${names}`,
    deltaUnknown: 'Неизвестен item level на екипирания предмет — въведи ръчно',
    deltaAuto: 'Автоматично от екипировката, може да се редактира',
    emptyCandidates: (difficulty: string) =>
      `Никой не е симнал този предмет на ${difficulty}. Включи „Покажи играчи без sim“, за да класираш целия състав.`,
    legendSuffix:
      '— делено на (1 + L), по A и M+ ефорт фактора F. Тир токени: първо 2p/4p (виж Правила).',
    selectHint: 'Избери предмет, за да класираш кандидатите.',
    ilvlComponent: 'ΔI компонент',
    simComponent: 'Sim компонент',
  },
  history: {
    title: 'История на луута',
    sub: (days: number) =>
      `Награди, синхронизирани от wowaudit. Редовете в текущия ${days}-дневен прозорец се броят към наказанието L.`,
    allPlayers: 'Всички играчи',
    hideExcluded: 'Скрий offspec / изключени',
    awards: (n: number) => `${n} награди`,
    colDate: 'Дата',
    colItem: 'Предмет',
    colSlot: 'Слот',
    colPlayer: 'Играч',
    colDifficulty: 'Трудност',
    colResponse: 'Отговор',
    colCounts: 'Брои се към L',
    inWindow: 'в прозореца',
    expired: 'изтекъл',
    no: 'не',
    empty: 'Все още няма записан луут.',
  },
  rules: {
    title: 'WoW S2 Loot Priority Score (LPS)',
    sub: 'Правила и формула за справедливо разпределение на предмети.',
    formulaTitle: 'Математическата формула',
    formulaNote:
      'Тежестите се четат на живо от настройките (⚙) — промените там се отразяват тук и в Loot Council изчисленията.',
    varsTitle: 'Променливи и тежести — „Анти-Мързел“ система',
    colVariable: 'Променлива',
    colMeaning: 'Значение',
    colWeight: 'Тежест',
    deltaName: 'ΔI — разлика в Item Level',
    deltaDesc:
      'Чистата разлика между новия предмет и стария. Намалена тежест, за да не се подаряват предмети на хора, които не фармят Mythic+.',
    simName: 'S — Sim Upgrade %',
    simDesc:
      'Увеличението на throughput от droptimizer (Raidbots) или QELive (за хийлъри). Само танковете са изключени (техните sim-ове не са сравними) — хийлърите се състезават с техния sim. Основен фактор за прогреса на гилдията.',
    effortName: 'F — M+ ефорт фактор',
    effortDesc: (minLevel: number, cap: number) =>
      `Множител върху целия резултат, изчислен от ефорт скалата M (0–10): броят се ключове от ниво ${minLevel}+ за последните два седмични reset-а, ${cap} и повече ключа = M 10 → F ×1.00; нула ключове → минимума. Играчи с ilvl над прага „M+ готов“ се водят с пълен ефорт — M+ вече не им дава ъпгрейди и спирането не е мързел. Ефортът модулира нуждата, вместо да я замества: никой не печели предмет, който не му трябва, само с фармене — но при сравними ъпгрейди инвестираният играч винаги печели. (Пълните енчанти и камъни се подразбират — не се точкуват.)`,
    lootName: 'L — скорошен луут',
    lootDesc: (days: number) =>
      `Броят предмети, получени през последните ${days} дни. Предотвратява лакомията и облича рейда равномерно.`,
    activityName: 'A — статус / активност',
    activityDescRegular: '— редовен/активен: идва на рейд и отключва слотове във Vault.',
    activityDescCasual: (penalty: string | null) =>
      `— нередовен/кежуъл: raid-logger, нови trial-и или чести отсъствия (${penalty}% наказание). Определя се от loot council-а.`,
    weightMultiplier: 'множител',
    exceptionsTitle: 'Изключения (Hard Reserves)',
    exception1Bold: 'Tier Sets:',
    exception1:
      'токъните се дават първо на играчи, които с тях завършват своя 2-piece или 4-piece сет бонус, преди да се приложи формулата за останалите.',
    exception2Bold: 'Екстремни BiS предмети:',
    exception2:
      'много редки оръжия или уникални тринкети се обсъждат само между класовете, за които са абсолютно Best-in-Slot.',
    exampleTitle: 'Примерно пресмятане',
    exampleSub:
      'Пада предмет. И двамата играчи нямат скорошен луут (L = 0) и са със статус „Редовен“ (A = 1.0).',
    example1Title: 'Играч 1 — The M+ Grinder',
    example1Note: 'Фарми ключове всяка седмица — малко по-малък ъпгрейд, но пълен ефорт фактор (F = 1.00).',
    example2Title: 'Играч 2 — Raid-Logger',
    example2Note: 'Влиза само за рейда — дори малко по-голям ъпгрейд, но нула ключове (F = 0.70).',
    points: 'т.',
    conclusionBold: 'Заключение:',
    conclusion:
      'Грайндърът печели близката битка — raid-logger-ът плаща 30% ефорт данък върху всичко. Но ефортът само накланя везните: при наистина огромна разлика в нуждата (напр. 2.5% срещу 0.3% sim) предметът пак отива там, където помага най-много на рейда — обложен с данък, но не блокиран.',
  },
};

const DICTS: Record<Lang, Strings> = { en, bg };

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'bg') return stored;
  } catch {
    // localStorage unavailable — fall through
  }
  return 'en';
}

export const I18nStore = signalStore(
  { providedIn: 'root' },
  withState(() => ({ lang: initialLang() })),
  withComputed((store) => ({
    t: computed(() => DICTS[store.lang()]),
  })),
  withMethods((store) => ({
    setLang(lang: Lang): void {
      patchState(store, { lang });
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        // ignore
      }
    },
  })),
);

/** Language-aware relative time ("3d ago" / "преди 3д"). */
export function timeAgoI18n(iso: string | null, t: Strings): string {
  if (!iso) return t.common.never;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 30) return t.common.monthsAgo(Math.floor(days / 30));
  if (days >= 1) return t.common.daysAgo(days);
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return t.common.hoursAgo(hours);
  return t.common.justNow;
}
