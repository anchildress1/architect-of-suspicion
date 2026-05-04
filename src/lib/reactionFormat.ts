/**
 * Tokenizer for the Architect's reaction text on render.
 *
 * Splits the model's output into typed segments (`text` | `em` | `strong`)
 * the renderer walks safely. No `{@html}` use anywhere — XSS surface is
 * zero, and eslint stays happy.
 *
 * Streaming-friendly: a half-open tag (delta `She <em>did` arriving before
 * `</em>` lands) is rendered as the literal text up to the open tag plus
 * the unmatched suffix as plain text. The next delta will close the tag and
 * the full string re-tokenizes correctly.
 *
 * The model is instructed to emit `<em>` and `<strong>` only; markdown
 * asterisks and any other tag (including disallowed ones, attributes, or
 * malformed nesting) render as literal characters — loud enough to spot in
 * QA, safe by construction.
 */

export type ReactionSegment =
  | { type: 'text'; value: string }
  | { type: 'em'; value: string }
  | { type: 'strong'; value: string };

// Matches a bare opening tag, its content (lazy), and its closing tag.
// No attributes allowed inside the opener — `<em foo="bar">` won't match,
// it'll fall through to the plain-text path and render as literal characters.
const TAG_PATTERN = /<(em|strong)>([\s\S]*?)<\/\1>/g;

export function tokenizeReaction(text: string): ReactionSegment[] {
  const segments: ReactionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, start) });
    }
    const tag = match[1] as 'em' | 'strong';
    segments.push({ type: tag, value: match[2] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments;
}
