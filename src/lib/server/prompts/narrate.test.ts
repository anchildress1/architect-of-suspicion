import { describe, it, expect } from 'vitest';
import { buildNarrationPrompt, type NarrationAction } from './narrate';

const baseContext = {
  claim: 'Ashley is too reliant on AI',
  action: 'enter_room' as NarrationAction,
  room: 'The Library',
  evidenceCount: { proof: 2, objection: 1 },
  roomsVisited: ['study', 'library'],
};

describe('buildNarrationPrompt', () => {
  it('includes the claim text', () => {
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toContain('Ashley is too reliant on AI');
  });

  it('uses enter_room description', () => {
    const prompt = buildNarrationPrompt({ ...baseContext, action: 'enter_room' });
    expect(prompt).toContain('has just entered the The Library');
  });

  it('uses idle description', () => {
    const prompt = buildNarrationPrompt({ ...baseContext, action: 'idle' });
    expect(prompt).toContain('lingers in the The Library, hesitating');
  });

  it('uses wander description', () => {
    const prompt = buildNarrationPrompt({ ...baseContext, action: 'wander' });
    expect(prompt).toContain('wanders the mansion halls');
  });

  it('includes evidence counts', () => {
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toContain('3 total (2 proof, 1 objections)');
  });

  it('lists visited rooms', () => {
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toContain('study, library');
  });

  it('shows "none yet" when no rooms visited', () => {
    const prompt = buildNarrationPrompt({ ...baseContext, roomsVisited: [] });
    expect(prompt).toContain('none yet');
  });

  it('includes output format instructions', () => {
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toContain('ONLY the dialogue text');
    expect(prompt).toContain('no JSON');
  });
});
