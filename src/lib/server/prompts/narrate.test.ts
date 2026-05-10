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

  it('uses idle description without claiming hesitation', () => {
    // Earlier idle description "lingers...hesitating" baked an editorial
    // state assumption into the input — the player might be reading
    // carefully. The neutral framing is "still in the room"; the idle
    // tone branch leans on the pause without claiming to read the
    // player's emotional state.
    const prompt = buildNarrationPrompt({ ...baseContext, action: 'idle' });
    expect(prompt).toContain('still in the The Library');
    expect(prompt).not.toContain('hesitating');
  });

  it('uses wander description without claiming the player is idle', () => {
    // Earlier wander description "without examining evidence" was a
    // hardcoded lie that fired even when the player had picks. Neutral
    // framing now: "between rooms"; the wander tone branch grounds in
    // the State numbers instead of presuming idleness.
    const prompt = buildNarrationPrompt({ ...baseContext, action: 'wander' });
    expect(prompt).toContain('mansion halls, between rooms');
    expect(prompt).not.toContain('without examining evidence');
  });

  it('grounds the model in total rooms and remaining count', () => {
    // Earlier output hallucinated counts ("you've walked ten rooms" when
    // there are 7 chambers). The State block now anchors total / visited
    // / remaining so the model has facts to reference.
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toMatch(/Rooms \(7 total\)/);
    expect(prompt).toMatch(/2 visited, 5 remaining/);
  });

  it('dedupes the visited rooms list', () => {
    // roomsVisited is an ordered visit log — revisits show as duplicates.
    // Without dedupe, "10 visits across 7 chambers" collapses into the
    // model claiming the player walked ten rooms.
    const prompt = buildNarrationPrompt({
      ...baseContext,
      roomsVisited: ['library', 'study', 'library', 'parlor', 'library'],
    });
    expect(prompt).toMatch(/3 visited/);
    expect(prompt).toContain('library, study, parlor');
  });

  it('clamps remaining to zero when more unique rooms than registered', () => {
    // Defensive: if roomsVisited ever contains more unique values than
    // ROOM_CONTENT (e.g., a room renamed but log still has the old slug),
    // remaining must not go negative.
    const prompt = buildNarrationPrompt({
      ...baseContext,
      roomsVisited: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    });
    expect(prompt).toMatch(/0 remaining/);
  });

  it('includes evidence counts', () => {
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toContain('3 picks (2 proof, 1 objections)');
  });

  it('lists visited rooms', () => {
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toContain('study, library');
  });

  it('shows "none yet" when no rooms visited', () => {
    const prompt = buildNarrationPrompt({ ...baseContext, roomsVisited: [] });
    expect(prompt).toContain('none yet');
    // Wandering with no evidence engaged: indecision is fair to needle.
    // The wander tone branch keeps that path open.
    const wanderPrompt = buildNarrationPrompt({
      ...baseContext,
      action: 'wander',
      roomsVisited: [],
      evidenceCount: { proof: 0, objection: 0 },
    });
    expect(wanderPrompt).toMatch(/With no evidence engaged, the indecision is fair to needle/i);
  });

  it('locks the no-direction-implication guardrails', () => {
    // Earlier narration output invented progress scores ("the claim
    // hangs there like an unexamined scaffold") and directional reads
    // ("afraid of what over-engineering actually looks like"). The
    // narration has no per-card direction; the GUARDRAILS block locks
    // it from inventing one.
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toMatch(/GUARDRAILS:/);
    expect(prompt).toMatch(/no per-card direction/i);
    expect(prompt).toMatch(/never imply the claim has a clear answer/i);
    expect(prompt).toMatch(/describe progress as success or failure/i);
    expect(prompt).toMatch(/never invent rooms, picks, or progress signals/i);
    expect(prompt).toMatch(/Architect observes; the player decides/i);
  });

  it('includes output format instructions', () => {
    const prompt = buildNarrationPrompt(baseContext);
    expect(prompt).toContain('ONLY the dialogue text');
    expect(prompt).toContain('no JSON');
  });
});
