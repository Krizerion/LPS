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
    sampleBannerPrefix: 'Showing',
    sampleBannerBold: 'sample data',
    sampleBannerSuffix: '— run',
    sampleBannerEnd: 'with your wowaudit API key to load your guild.',
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
    enchant: 'Enchant score (E)',
    lootActivity: 'Recent loot & activity',
    lootWindow: 'Loot window (days)',
    casualMultiplier: 'Casual (Нередовен) multiplier',
    zeroSim: 'Zero sim for tanks/healers',
    dropIlvls: 'Fallback drop item level per difficulty',
    normal: 'Normal',
    heroic: 'Heroic',
    mythic: 'Mythic',
    formulaNote: (casual: string | null) => `divided by (1 + L), times A; casual A = ${casual}`,
    clearOverrides: 'Clear player overrides',
    reset: 'Reset to defaults',
  },
  standings: {
    title: 'Standings',
    sub: 'Everything that feeds the formula per player. Status (A) is a council decision — click it to toggle in this browser, or edit public/data/overrides.json to set it for everyone. Click the E score to override it.',
    rosterSize: 'Raiders tracked',
    casualCount: 'Marked Нередовен',
    recentLoot: 'Items in loot window',
    staleWishlists: 'Stale droptimizers (>14d)',
    search: 'Search player…',
    colPlayer: 'Player',
    colRole: 'Role',
    colIlvl: 'ilvl',
    colStatus: 'Status (A)',
    colEnchants: 'Enchants (E)',
    colRecentLoot: 'Recent loot (L)',
    colLootTotal: 'Loot total',
    colDroptimizer: 'Droptimizer',
    statusTooltip: 'Council decision — click to toggle in this browser (● = local override)',
    enchantTooltip: 'Click to set manually (0–10)',
    localOverride: 'Local override (this browser only)',
    noData: 'no data',
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
    colEnchantTooltip: 'Enchant score 0–10',
    colLootTooltip: 'Recent loot count',
    colActivityTooltip: 'Activity multiplier',
    staleSim: 'stale sim',
    staleSimTooltip: 'Droptimizer older than 14 days',
    noSim: 'no sim',
    deltaUnknown: 'Equipped item level unknown — set manually',
    deltaAuto: 'Auto from equipped gear, editable',
    emptyCandidates: (difficulty: string) =>
      `Nobody has simmed this item on ${difficulty}. Toggle “show players without sims” to rank the whole roster.`,
    legendSuffix:
      '— divided by (1 + L), times A. Tier tokens: complete 2p/4p first (see Rules).',
    selectHint: 'Select an item to rank candidates.',
    ilvlComponent: 'ΔI component',
    simComponent: 'Sim component',
    enchantComponent: 'Enchant component',
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
      'The DPS increase according to Raidbots (Droptimizer). For tanks and healers this value is 0. The main factor for guild progress.',
    enchName: 'E — enchants and gems',
    enchDesc:
      'A 0 to 10 scale. Perfect enchants = 10 points, none = 0. Strictly rewards the gold and effort invested outside the raid.',
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
    example1Note: 'Farmed M+ all week — small upgrade, but perfect enchants.',
    example2Title: 'Player 2 — Raid-Logger',
    example2Note: 'Only logs in for raid — huge upgrade, but zero investment.',
    points: 'pts',
    conclusionBold: 'Conclusion:',
    conclusion:
      'The farmer wins the item decisively. The formula punishes lack of personal investment and does not let raid-loggers scoop up items just because they have a lower item level.',
  },
};

export type Strings = typeof en;

const bg: Strings = {
  common: {
    appSubtitle: 'Loot Priority Score',
    dataAgo: (ago: string) => `данни ${ago}`,
    settingsTitle: 'LPS настройки',
    sampleBannerPrefix: 'Показват се',
    sampleBannerBold: 'примерни данни',
    sampleBannerSuffix: '— изпълни',
    sampleBannerEnd: 'с wowaudit API ключа на гилдията, за да заредиш реалните данни.',
    loadErrorTitle: 'Данните на гилдията не можаха да се заредят',
    retry: 'Опитай пак',
    loading: 'Зареждане на данните…',
    regular: 'Редовен',
    casual: 'Нередовен',
    never: 'никога',
    justNow: 'току-що',
    daysAgo: (n: number) => `преди ${n}д`,
    hoursAgo: (n: number) => `преди ${n}ч`,
    monthsAgo: (n: number) => `преди ${n}м`,
  },
  nav: {
    standings: 'Класиране',
    council: 'Loot Council',
    history: 'История',
    rules: 'Правила',
  },
  roles: {
    Tank: 'Танк',
    Heal: 'Хийлър',
    Melee: 'Мели',
    Ranged: 'Рейндж',
  } as Record<string, string>,
  settings: {
    title: 'LPS Настройки',
    weights: 'Тежести',
    deltaIlvl: 'Разлика в Item Level (ΔI)',
    simPercent: 'Sim ъпгрейд % (S)',
    enchant: 'Оценка за енчанти (E)',
    lootActivity: 'Скорошен луут и активност',
    lootWindow: 'Луут прозорец (дни)',
    casualMultiplier: 'Множител за Нередовен',
    zeroSim: 'Нулев sim за танкове/хийлъри',
    dropIlvls: 'Резервен item level на дроп по трудност',
    normal: 'Normal',
    heroic: 'Heroic',
    mythic: 'Mythic',
    formulaNote: (casual: string | null) => `делено на (1 + L), по A; Нередовен A = ${casual}`,
    clearOverrides: 'Изчисти ръчните корекции',
    reset: 'Върни по подразбиране',
  },
  standings: {
    title: 'Класиране',
    sub: 'Всичко, което влиза във формулата, за всеки играч. Статусът (A) е решение на съвета — кликни го за смяна в този браузър или редактирай public/data/overrides.json, за да важи за всички. Кликни E за ръчна оценка.',
    rosterSize: 'Проследени рейдъри',
    casualCount: 'Отбелязани Нередовен',
    recentLoot: 'Предмети в луут прозореца',
    staleWishlists: 'Остарели droptimizer-и (>14д)',
    search: 'Търси играч…',
    colPlayer: 'Играч',
    colRole: 'Роля',
    colIlvl: 'ilvl',
    colStatus: 'Статус (A)',
    colEnchants: 'Енчанти (E)',
    colRecentLoot: 'Скорошен луут (L)',
    colLootTotal: 'Общо луут',
    colDroptimizer: 'Droptimizer',
    statusTooltip: 'Решение на съвета — кликни за смяна в този браузър (● = локална корекция)',
    enchantTooltip: 'Кликни за ръчна оценка (0–10)',
    localOverride: 'Локална корекция (само този браузър)',
    noData: 'няма данни',
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
    colEnchantTooltip: 'Оценка за енчанти 0–10',
    colLootTooltip: 'Брой скорошен луут',
    colActivityTooltip: 'Множител за активност',
    staleSim: 'стар sim',
    staleSimTooltip: 'Droptimizer по-стар от 14 дни',
    noSim: 'без sim',
    deltaUnknown: 'Неизвестен item level на екипирания предмет — въведи ръчно',
    deltaAuto: 'Автоматично от екипировката, може да се редактира',
    emptyCandidates: (difficulty: string) =>
      `Никой не е симнал този предмет на ${difficulty}. Включи „Покажи играчи без sim“, за да класираш целия състав.`,
    legendSuffix: '— делено на (1 + L), по A. Тир токени: първо 2p/4p (виж Правила).',
    selectHint: 'Избери предмет, за да класираш кандидатите.',
    ilvlComponent: 'ΔI компонент',
    simComponent: 'Sim компонент',
    enchantComponent: 'Енчант компонент',
  },
  history: {
    title: 'История на луута',
    sub: (days: number) =>
      `Награди, синхронизирани от wowaudit. Редовете в текущия ${days}-дневен прозорец се броят за наказанието L.`,
    allPlayers: 'Всички играчи',
    hideExcluded: 'Скрий offspec / изключени',
    awards: (n: number) => `${n} награди`,
    colDate: 'Дата',
    colItem: 'Предмет',
    colSlot: 'Слот',
    colPlayer: 'Играч',
    colDifficulty: 'Трудност',
    colResponse: 'Отговор',
    colCounts: 'Брои се за L',
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
      'Увеличението на DPS според Raidbots (Droptimizer). За танкове и хийлъри тази стойност е 0. Основен фактор за прогреса на гилдията.',
    enchName: 'E — енчанти и камъни',
    enchDesc:
      'Скала от 0 до 10. Перфектни енчанти = 10 точки, липса = 0. Строго възнаграждава инвестицията на злато и усилия извън рейда.',
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
    example1Note: 'Фармил е M+ цяла седмица — малък ъпгрейд, но перфектни енчанти.',
    example2Title: 'Играч 2 — Raid-Logger',
    example2Note: 'Влиза само за рейда — огромен ъпгрейд, но нула инвестиция.',
    points: 'т.',
    conclusionBold: 'Заключение:',
    conclusion:
      'Фармърът печели предмета категорично. Формулата наказва липсата на лична инвестиция и не позволява на raid-loggers да обират предметите само защото имат по-нисък Item Level.',
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
  return 'bg';
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
