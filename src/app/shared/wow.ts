export const CLASS_COLORS: Record<string, string> = {
  'Death Knight': '#C41E3A',
  'Demon Hunter': '#A330C9',
  Druid: '#FF7C0A',
  Evoker: '#33937F',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B6D',
};

export function classColor(wowClass: string): string {
  return CLASS_COLORS[wowClass] ?? '#9aa4b2';
}

export const ROLE_ICONS: Record<string, string> = {
  Tank: '🛡️',
  Heal: '💚',
  Melee: '⚔️',
  Ranged: '🏹',
};

const SLOT_LABELS: Record<string, string> = {
  head: 'Head',
  neck: 'Neck',
  shoulder: 'Shoulder',
  shoulders: 'Shoulder',
  back: 'Back',
  cloak: 'Back',
  chest: 'Chest',
  waist: 'Waist',
  wrist: 'Wrist',
  wrists: 'Wrist',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  finger: 'Ring',
  trinket: 'Trinket',
  main_hand: 'Main Hand',
  main_hand_2h: 'Two-Hand',
  two_hand: 'Two-Hand',
  one_hand: 'One-Hand',
  off_hand: 'Off Hand',
  offhand: 'Off Hand',
  shield: 'Shield',
  ranged: 'Ranged',
};

export function slotLabel(slot: string): string {
  const key = slot?.toLowerCase() ?? '';
  return SLOT_LABELS[key] ?? (key ? key.replace(/_/g, ' ') : '—');
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  return 'just now';
}

export function wowheadUrl(itemId: number): string {
  return `https://www.wowhead.com/item=${itemId}`;
}

/** Icon image for a Wowhead/Blizzard icon name (e.g. "inv_misc_cape_20"). */
export function iconUrl(icon: string | null | undefined, size: 'small' | 'medium' = 'small'): string | null {
  return icon ? `https://wow.zamimg.com/images/wow/icons/${size}/${icon}.jpg` : null;
}

declare global {
  interface Window {
    $WowheadPower?: { refreshLinks(): void };
  }
}

/** Re-scan the DOM for wowhead links after Angular renders new ones. */
export function refreshWowheadLinks(): void {
  queueMicrotask(() => window.$WowheadPower?.refreshLinks?.());
}
