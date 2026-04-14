import { describe, it, expect } from 'vitest';
import { rooms, getRoomBySlug } from './rooms';

describe('rooms', () => {
  it('has exactly 9 rooms', () => {
    expect(rooms).toHaveLength(9);
  });

  it('covers all grid positions in a 3x3 grid', () => {
    const positions = rooms.map((r) => `${r.row},${r.col}`);
    expect(positions).toContain('0,0');
    expect(positions).toContain('0,1');
    expect(positions).toContain('0,2');
    expect(positions).toContain('1,0');
    expect(positions).toContain('1,1');
    expect(positions).toContain('1,2');
    expect(positions).toContain('2,0');
    expect(positions).toContain('2,1');
    expect(positions).toContain('2,2');
  });

  it('has no duplicate grid positions', () => {
    const positions = rooms.map((r) => `${r.row},${r.col}`);
    expect(new Set(positions).size).toBe(9);
  });

  it('has no duplicate slugs', () => {
    const slugs = rooms.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(9);
  });

  it('marks entry-hall and attic as non-playable', () => {
    const entryHall = rooms.find((r) => r.slug === 'entry-hall');
    const attic = rooms.find((r) => r.slug === 'attic');
    expect(entryHall?.isPlayable).toBe(false);
    expect(attic?.isPlayable).toBe(false);
  });

  it('marks remaining 7 rooms as playable', () => {
    const playable = rooms.filter((r) => r.isPlayable);
    expect(playable).toHaveLength(7);
  });

  it('each room has a background path', () => {
    for (const room of rooms) {
      expect(room.background).toMatch(/^\/backgrounds\/.+\.webp$/);
    }
  });
});

describe('getRoomBySlug', () => {
  it('returns the correct room for a valid slug', () => {
    const room = getRoomBySlug('library');
    expect(room).toBeDefined();
    expect(room?.name).toBe('Library');
    expect(room?.category).toBe('Philosophy');
  });

  it('returns undefined for an invalid slug', () => {
    expect(getRoomBySlug('dungeon')).toBeUndefined();
  });
});
