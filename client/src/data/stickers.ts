export interface StickerPack {
  id: string;
  name: string;
  icon: string;
  stickers: string[];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'expressions',
    name: 'Expressions',
    icon: '😊',
    stickers: [
      '😊','😂','🤣','😍','🥰','😘','😎','🤩','🥳','😜',
      '🤪','😅','😭','😢','😤','😡','🤬','🥺','😰','🤯',
      '😱','🤔','🤫','🤭','😏','😒','🙄','😑','😐','🥱',
      '🤗','🫠','😵','🥴','😇','🤠','🥸','🤓','👻','😈',
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures',
    icon: '👍',
    stickers: [
      '👍','👎','👌','🤌','✌️','🤞','🤙','👋','🙌','🤝',
      '🙏','💪','🫶','❤️','🧡','💛','💚','💙','💜','🖤',
      '💔','💯','🔥','⭐','✨','💫','💥','🎯','🚀','💎',
      '👀','💀','🤦','🤷','🫣','🤐','🫡','🫢','🤧','🫂',
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    icon: '🐱',
    stickers: [
      '🐱','🐶','🐻','🐼','🐨','🦁','🐯','🦊','🐺','🐮',
      '🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🦆','🦄',
      '🐝','🦋','🐢','🐙','🦈','🐬','🦭','🦩','🦚','🦜',
      '🐉','🦖','🦎','🦀','🦞','🦐','🐡','🐠','🦊','🐦',
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: '🍕',
    stickers: [
      '🍕','🍔','🌮','🌯','🥗','🍜','🍣','🍱','🧇','🥐',
      '🥪','🧆','🥙','🌶️','🫕','🍲','🥘','🍛','🍝','🍠',
      '☕','🧋','🍺','🥂','🍾','🧃','🥤','🧊','🎂','🍰',
      '🧁','🍩','🍪','🍫','🍭','🍦','🍧','🍡','🧇','🥓',
    ],
  },
  {
    id: 'activities',
    name: 'Activities',
    icon: '🎉',
    stickers: [
      '🎉','🎊','🎈','🎁','🎮','🎯','⚽','🏀','🎸','🎵',
      '🎤','🎬','📸','📱','💻','🎧','🎨','✏️','📚','🔬',
      '🏆','🥇','🎖️','🏅','🎭','🎪','🎡','🎢','🎠','🎟️',
      '🌈','⛄','🌊','🏔️','🌋','🗺️','🧭','🏕️','🌅','🌠',
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: '💌',
    stickers: [
      '💌','📩','📬','🗒️','📋','📌','📎','🖇️','✂️','🔑',
      '🔐','🔒','🔓','🏠','🏡','🏢','🏰','⛩️','🗼','🏛️',
      '💡','🔦','🕯️','💈','🪄','🔮','🧿','🪬','☮️','✝️',
      '🌍','🌎','🌏','🗾','🧲','⚡','🌀','❄️','☄️','🌪️',
    ],
  },
];

const RECENT_KEY = 'vyre:recent-stickers';
const MAX_RECENT = 24;

export function getRecentStickers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addRecentSticker(emoji: string) {
  const recent = getRecentStickers().filter(e => e !== emoji);
  recent.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}
