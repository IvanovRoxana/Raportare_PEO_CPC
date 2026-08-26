import type { Expert } from './types';

const EXPERT_AVATAR_BY_ID: Record<string, string> = {
  'alexandra-colceru': '/team-avatars/alexandra-colceru.png',
  'alexandru-enache': '/team-avatars/alexandru-enache.jpg',
  'andreea-cojocaru': '/team-avatars/andreea-cojocaru.jpg',
  'bianca-toma': '/team-avatars/bianca-toma.png',
  'diana-ungureanu': '/team-avatars/diana-ungureanu.jpg',
  'gabriel-zvinca': '/team-avatars/gabriel-zvinca.jpeg',
  'irina-nicolae': '/team-avatars/irina-nicolae.jpg',
  'roxana-ivanov': '/team-avatars/roxana-ivanov.jpg',
  'malvina-ciciula': '/team-avatars/malvina-ciciula.png',
  'mihaela-grigoras': '/team-avatars/mihaela-grigoras.jpg',
  'nida-halit': '/team-avatars/nida-halit.jpg',
  'radu-ianos': '/team-avatars/radu-ianos.jpg',
  'simona-khamissi': '/team-avatars/simona-khamissi.jpeg',
};

export function slugifyExpertName(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getExpertInitials(name?: string | null) {
  return String(name || 'Expert')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'EX';
}

export function getDefaultExpertAvatarUrl(expert: Pick<Expert, 'id' | 'name'> | string) {
  const id = typeof expert === 'string' ? slugifyExpertName(expert) : expert.id || slugifyExpertName(expert.name);
  const nameSlug = typeof expert === 'string' ? id : slugifyExpertName(expert.name);
  return EXPERT_AVATAR_BY_ID[id] || EXPERT_AVATAR_BY_ID[nameSlug];
}

export function getExpertAvatarSource(expert: Pick<Expert, 'id' | 'name' | 'avatarUrl'>) {
  return expert.avatarUrl?.trim() || getDefaultExpertAvatarUrl(expert);
}
