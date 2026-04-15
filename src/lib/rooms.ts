export interface RoomConfig {
  slug: string;
  name: string;
  category: string;
  row: number;
  col: number;
  isPlayable: boolean;
  background: string;
}

export const rooms: RoomConfig[] = [
  {
    slug: 'attic',
    name: 'Attic',
    category: 'Meta',
    row: 0,
    col: 0,
    isPlayable: false,
    background: '/backgrounds/attic.webp',
  },
  {
    slug: 'gallery',
    name: 'Gallery',
    category: 'Awards',
    row: 0,
    col: 1,
    isPlayable: true,
    background: '/backgrounds/gallery.webp',
  },
  {
    slug: 'control-room',
    name: 'Control Room',
    category: 'Constraints',
    row: 0,
    col: 2,
    isPlayable: true,
    background: '/backgrounds/control-room.webp',
  },
  {
    slug: 'parlor',
    name: 'Parlor',
    category: 'Decisions',
    row: 1,
    col: 0,
    isPlayable: true,
    background: '/backgrounds/parlor.webp',
  },
  {
    slug: 'entry-hall',
    name: 'Entry Hall',
    category: '',
    row: 1,
    col: 1,
    isPlayable: false,
    background: '/backgrounds/entry-hall.webp',
  },
  {
    slug: 'library',
    name: 'Library',
    category: 'Philosophy',
    row: 1,
    col: 2,
    isPlayable: true,
    background: '/backgrounds/library.webp',
  },
  {
    slug: 'workshop',
    name: 'Workshop',
    category: 'Experimentation',
    row: 2,
    col: 0,
    isPlayable: true,
    background: '/backgrounds/workshop.webp',
  },
  {
    slug: 'cellar',
    name: 'Cellar',
    category: 'Work Style',
    row: 2,
    col: 1,
    isPlayable: true,
    background: '/backgrounds/cellar.webp',
  },
  {
    slug: 'back-hall',
    name: 'Back Hall',
    category: 'Experience',
    row: 2,
    col: 2,
    isPlayable: true,
    background: '/backgrounds/back-hall.webp',
  },
];

export const roomsByGrid: RoomConfig[] = rooms.toSorted(
  (a, b) => a.row - b.row || a.col - b.col,
);

export function getRoomBySlug(slug: string): RoomConfig | undefined {
  return rooms.find((r) => r.slug === slug);
}
