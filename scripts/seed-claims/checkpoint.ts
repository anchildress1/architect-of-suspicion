/** Checkpoint pass outputs to disk so a downstream failure doesn't force a
 *  re-run of upstream passes (which burn real API credits on every retry).
 *
 *  Cache layout: `.seed-cache/<pass>.json`. Each file's content is keyed by a
 *  `corpusSignature` derived from the current card corpus; if the signature
 *  changes (cards added/removed/re-tagged) the checkpoint is invalidated so
 *  we don't resume with stale inputs. Turn off entirely with
 *  `CLAIM_ENGINE_CHECKPOINT=false`.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve as pathResolve } from 'node:path';
import type { CardRow } from './types';

const CACHE_DIR = pathResolve(process.cwd(), '.seed-cache');

export function isCheckpointingEnabled(): boolean {
  const raw = process.env.CLAIM_ENGINE_CHECKPOINT;
  if (raw === undefined || raw === '') return true;
  return raw.toLowerCase() !== 'false' && raw !== '0';
}

/** Fingerprint the input corpus so checkpoints bind to the exact card set
 *  they were produced from. SHA-256 of the ordered (objectID, updated_at)
 *  tuples — stable across runs when the corpus is unchanged. */
export function corpusSignature(cards: CardRow[]): string {
  const tuples = cards
    .map((c) => `${c.objectID}|${c.created_at ?? ''}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(tuples).digest('hex').slice(0, 16);
}

interface Envelope<T> {
  signature: string;
  /** Plain-JSON-serializable payload. Maps/Sets must be converted first by
   *  the caller's custom serializer. */
  payload: T;
  savedAt: string;
}

export async function saveCheckpoint<T>(
  pass: string,
  signature: string,
  payload: T,
): Promise<void> {
  if (!isCheckpointingEnabled()) return;
  await mkdir(CACHE_DIR, { recursive: true });
  const envelope: Envelope<T> = { signature, payload, savedAt: new Date().toISOString() };
  const path = pathResolve(CACHE_DIR, `${pass}.json`);
  await writeFile(path, JSON.stringify(envelope, null, 2), 'utf8');
  // Constant format string; dynamic pieces are passed as separate args so
  // util.format can't be tricked by injected format specifiers.
  console.log('[checkpoint] saved %s (signature=%s)', pass, signature);
}

export async function loadCheckpoint<T>(pass: string, signature: string): Promise<T | undefined> {
  if (!isCheckpointingEnabled()) return undefined;
  const path = pathResolve(CACHE_DIR, `${pass}.json`);
  try {
    const raw = await readFile(path, 'utf8');
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (envelope.signature !== signature) {
      console.log(
        '[checkpoint] %s stale (signature %s != %s); ignoring',
        pass,
        envelope.signature,
        signature,
      );
      return undefined;
    }
    console.log('[checkpoint] resuming %s from %s', pass, envelope.savedAt);
    return envelope.payload;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    console.warn('[checkpoint] failed to read %s, re-running:', pass, err);
    return undefined;
  }
}
