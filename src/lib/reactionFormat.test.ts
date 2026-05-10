import { describe, it, expect } from 'vitest';
import { tokenizeReaction } from './reactionFormat';

describe('tokenizeReaction', () => {
  it('returns plain prose as a single text segment', () => {
    expect(tokenizeReaction('A pointed observation.')).toEqual([
      { type: 'text', value: 'A pointed observation.' },
    ]);
  });

  it('splits around an <em> run', () => {
    expect(tokenizeReaction('She <em>did</em> ship it.')).toEqual([
      { type: 'text', value: 'She ' },
      { type: 'em', value: 'did' },
      { type: 'text', value: ' ship it.' },
    ]);
  });

  it('splits around a <strong> run', () => {
    expect(tokenizeReaction('The record stands: <strong>22 days</strong>.')).toEqual([
      { type: 'text', value: 'The record stands: ' },
      { type: 'strong', value: '22 days' },
      { type: 'text', value: '.' },
    ]);
  });

  it('treats <script> as plain text — no allowlist match', () => {
    expect(tokenizeReaction('Hi<script>alert(1)</script>')).toEqual([
      { type: 'text', value: 'Hi<script>alert(1)</script>' },
    ]);
  });

  it('treats tags with attributes as plain text — only bare <em> matches', () => {
    expect(tokenizeReaction('<em onclick="x">bad</em>')).toEqual([
      { type: 'text', value: '<em onclick="x">bad</em>' },
    ]);
  });

  it('treats <img> with onerror as plain text', () => {
    expect(tokenizeReaction('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', value: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it('renders markdown asterisks as literal characters', () => {
    expect(tokenizeReaction('She *did* ship it.')).toEqual([
      { type: 'text', value: 'She *did* ship it.' },
    ]);
  });

  it('handles a half-open tag mid-stream as plain text', () => {
    // Streaming partial: opener arrived, closer hasn't yet. The whole string
    // becomes one text segment until the next delta closes the tag.
    expect(tokenizeReaction('She <em>did')).toEqual([{ type: 'text', value: 'She <em>did' }]);
  });

  it('handles a half-open disallowed tag as plain text', () => {
    expect(tokenizeReaction('Hi <scr')).toEqual([{ type: 'text', value: 'Hi <scr' }]);
  });

  it('handles multiple allowlisted tags in one string', () => {
    expect(tokenizeReaction('<em>She</em> shipped it; <strong>22 days</strong>.')).toEqual([
      { type: 'em', value: 'She' },
      { type: 'text', value: ' shipped it; ' },
      { type: 'strong', value: '22 days' },
      { type: 'text', value: '.' },
    ]);
  });

  it('handles back-to-back tags without text between them', () => {
    expect(tokenizeReaction('<em>foo</em><strong>bar</strong>')).toEqual([
      { type: 'em', value: 'foo' },
      { type: 'strong', value: 'bar' },
    ]);
  });

  it('treats nested same-tag as the outermost opener-to-first-closer', () => {
    // Lazy match closes on the first </em>. The trailing "</em>" becomes plain.
    expect(tokenizeReaction('<em>a<em>b</em>c</em>')).toEqual([
      { type: 'em', value: 'a<em>b' },
      { type: 'text', value: 'c</em>' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(tokenizeReaction('')).toEqual([]);
  });
});
