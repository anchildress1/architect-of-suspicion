import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve as pathResolve } from 'node:path';

const { mockMkdir, mockWriteFile, mockReadFile, mockReaddir, mockUnlink } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockReadFile: vi.fn(),
  mockReaddir: vi.fn(),
  mockUnlink: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

import {
  corpusSignature,
  isCheckpointingEnabled,
  loadCheckpoint,
  pruneStaleCheckpoints,
  saveCheckpoint,
} from './checkpoint';
import type { CardRow } from './types';

const CACHE_DIR = pathResolve(process.cwd(), '.seed-cache');

function makeCard(id: string, createdAt = '2026-01-01T00:00:00Z'): CardRow {
  return {
    objectID: id,
    text: `card ${id}`,
    category: 'Work Style',
    fact: 'fact',
    room: 'parlor',
    created_at: createdAt,
  } as CardRow;
}

function makeEnvelope<T>(signature: string, payload: T) {
  return JSON.stringify({ signature, payload, savedAt: '2026-01-01T00:00:00Z' }, null, 2);
}

describe('isCheckpointingEnabled', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CLAIM_ENGINE_CHECKPOINT;
    delete process.env.CLAIM_ENGINE_CHECKPOINT;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAIM_ENGINE_CHECKPOINT;
    } else {
      process.env.CLAIM_ENGINE_CHECKPOINT = originalEnv;
    }
  });

  it('returns true when env var is not set', () => {
    expect(isCheckpointingEnabled()).toBe(true);
  });

  it('returns true when env var is empty string', () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = '';
    expect(isCheckpointingEnabled()).toBe(true);
  });

  it('returns false for "false"', () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = 'false';
    expect(isCheckpointingEnabled()).toBe(false);
  });

  it('returns false for "FALSE" (case-insensitive)', () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = 'FALSE';
    expect(isCheckpointingEnabled()).toBe(false);
  });

  it('returns false for "0"', () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = '0';
    expect(isCheckpointingEnabled()).toBe(false);
  });

  it('returns true for "true"', () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = 'true';
    expect(isCheckpointingEnabled()).toBe(true);
  });

  it('returns true for "1"', () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = '1';
    expect(isCheckpointingEnabled()).toBe(true);
  });

  it('returns true for any other string', () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = 'yes';
    expect(isCheckpointingEnabled()).toBe(true);
  });
});

describe('corpusSignature', () => {
  it('returns a 16-char hex string', () => {
    const sig = corpusSignature([makeCard('a')]);
    expect(sig).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same card set', () => {
    const cards = [makeCard('a'), makeCard('b')];
    expect(corpusSignature(cards)).toBe(corpusSignature(cards));
  });

  it('changes when cards are added', () => {
    const before = corpusSignature([makeCard('a')]);
    const after = corpusSignature([makeCard('a'), makeCard('b')]);
    expect(before).not.toBe(after);
  });

  it('changes when a card is updated (created_at differs)', () => {
    const before = corpusSignature([makeCard('a', '2026-01-01T00:00:00Z')]);
    const after = corpusSignature([makeCard('a', '2026-06-01T00:00:00Z')]);
    expect(before).not.toBe(after);
  });

  it('produces the same signature regardless of input array order', () => {
    const sig1 = corpusSignature([makeCard('a'), makeCard('b')]);
    const sig2 = corpusSignature([makeCard('b'), makeCard('a')]);
    expect(sig1).toBe(sig2);
  });

  it('handles an empty card array', () => {
    const sig = corpusSignature([]);
    expect(sig).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('saveCheckpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the envelope to the correct path', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await saveCheckpoint('pass1-tensions', 'abc123', { data: 'value' });

    expect(mockMkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      pathResolve(CACHE_DIR, 'pass1-tensions.json'),
      expect.stringContaining('"signature": "abc123"'),
      'utf8',
    );
  });

  it('embeds the payload and savedAt in the envelope', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await saveCheckpoint('pass2-claims', 'sig42', ['claim-1', 'claim-2']);

    const written = mockWriteFile.mock.calls[0][1] as string;
    const envelope = JSON.parse(written);
    expect(envelope.signature).toBe('sig42');
    expect(envelope.payload).toEqual(['claim-1', 'claim-2']);
    expect(envelope.savedAt).toBeDefined();
  });

  it('returns early without writing when checkpointing is disabled', async () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = 'false';
    try {
      await saveCheckpoint('pass1-tensions', 'sig', {});
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    } finally {
      delete process.env.CLAIM_ENGINE_CHECKPOINT;
    }
  });
});

describe('loadCheckpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the payload when signature matches', async () => {
    const payload = { tensions: ['a', 'b'] };
    mockReadFile.mockResolvedValue(makeEnvelope('sig-match', payload));

    const result = await loadCheckpoint<typeof payload>('pass1-tensions', 'sig-match');

    expect(result).toEqual(payload);
    expect(mockReadFile).toHaveBeenCalledWith(
      pathResolve(CACHE_DIR, 'pass1-tensions.json'),
      'utf8',
    );
  });

  it('returns undefined when the file signature does not match the current signature', async () => {
    mockReadFile.mockResolvedValue(makeEnvelope('old-sig', { data: 'stale' }));
    const result = await loadCheckpoint('pass1-tensions', 'new-sig');
    expect(result).toBeUndefined();
  });

  it('returns undefined when the file does not exist', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(err);
    const result = await loadCheckpoint('pass1-tensions', 'any-sig');
    expect(result).toBeUndefined();
  });

  it('returns undefined and warns when the file is corrupt JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockReadFile.mockResolvedValue('{ not valid json }}}');
    const result = await loadCheckpoint('pass1-tensions', 'any-sig');
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[checkpoint] failed to read %s, re-running:',
      'pass1-tensions',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('returns undefined when checkpointing is disabled', async () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = '0';
    try {
      const result = await loadCheckpoint('pass1-tensions', 'any-sig');
      expect(result).toBeUndefined();
      expect(mockReadFile).not.toHaveBeenCalled();
    } finally {
      delete process.env.CLAIM_ENGINE_CHECKPOINT;
    }
  });
});

describe('pruneStaleCheckpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns early without touching the filesystem when checkpointing is disabled', async () => {
    process.env.CLAIM_ENGINE_CHECKPOINT = 'false';
    try {
      await pruneStaleCheckpoints('any-sig');
      expect(mockReaddir).not.toHaveBeenCalled();
    } finally {
      delete process.env.CLAIM_ENGINE_CHECKPOINT;
    }
  });

  it('returns silently when the cache directory does not exist', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReaddir.mockRejectedValue(err);
    await expect(pruneStaleCheckpoints('any-sig')).resolves.toBeUndefined();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('re-throws unexpected readdir errors', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    mockReaddir.mockRejectedValue(err);
    await expect(pruneStaleCheckpoints('any-sig')).rejects.toThrow('EACCES');
  });

  it('does nothing when the cache directory is empty', async () => {
    mockReaddir.mockResolvedValue([]);
    await pruneStaleCheckpoints('sig-current');
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('skips non-JSON files', async () => {
    mockReaddir.mockResolvedValue(['pass1-tensions.json.bak', 'README.md', '.DS_Store']);
    await pruneStaleCheckpoints('sig-current');
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('deletes a stale file whose signature does not match', async () => {
    mockReaddir.mockResolvedValue(['pass1-tensions.json']);
    mockReadFile.mockResolvedValue(makeEnvelope('old-sig', {}));
    mockUnlink.mockResolvedValue(undefined);

    await pruneStaleCheckpoints('sig-current');

    expect(mockUnlink).toHaveBeenCalledWith(pathResolve(CACHE_DIR, 'pass1-tensions.json'));
  });

  it('does not delete a file whose signature matches', async () => {
    mockReaddir.mockResolvedValue(['pass1-tensions.json']);
    mockReadFile.mockResolvedValue(makeEnvelope('sig-current', { tensions: [] }));

    await pruneStaleCheckpoints('sig-current');

    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('deletes an unreadable (corrupt) file', async () => {
    mockReaddir.mockResolvedValue(['corrupt.json']);
    mockReadFile.mockRejectedValue(new Error('read error'));
    mockUnlink.mockResolvedValue(undefined);

    await pruneStaleCheckpoints('sig-current');

    expect(mockUnlink).toHaveBeenCalledWith(pathResolve(CACHE_DIR, 'corrupt.json'));
  });

  it('deletes a file with invalid JSON silently', async () => {
    mockReaddir.mockResolvedValue(['bad.json']);
    mockReadFile.mockResolvedValue('not { json');
    mockUnlink.mockResolvedValue(undefined);

    await pruneStaleCheckpoints('sig-current');

    expect(mockUnlink).toHaveBeenCalledWith(pathResolve(CACHE_DIR, 'bad.json'));
  });

  it('silently ignores ENOENT on unlink (file already gone)', async () => {
    mockReaddir.mockResolvedValue(['gone.json']);
    mockReadFile.mockResolvedValue(makeEnvelope('stale-sig', {}));
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockUnlink.mockRejectedValue(err);

    await expect(pruneStaleCheckpoints('sig-current')).resolves.toBeUndefined();
  });

  it('warns on unexpected unlink errors without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockReaddir.mockResolvedValue(['locked.json']);
    mockReadFile.mockResolvedValue(makeEnvelope('stale-sig', {}));
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    mockUnlink.mockRejectedValue(err);

    await expect(pruneStaleCheckpoints('sig-current')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[checkpoint] failed to prune %s:',
      'locked.json',
      err,
    );
    warnSpy.mockRestore();
  });

  it('processes multiple files, pruning stale and keeping current', async () => {
    mockReaddir.mockResolvedValue([
      'pass1-tensions.json',
      'pass2-claims.json',
      'pass3-score.json',
      'old-run.json',
    ]);
    mockReadFile
      .mockResolvedValueOnce(makeEnvelope('sig-current', {})) // pass1 — keep
      .mockResolvedValueOnce(makeEnvelope('old-sig', {}))     // pass2 — prune
      .mockResolvedValueOnce(makeEnvelope('sig-current', {})) // pass3 — keep
      .mockResolvedValueOnce(makeEnvelope('ancient-sig', {})); // old-run — prune
    mockUnlink.mockResolvedValue(undefined);

    await pruneStaleCheckpoints('sig-current');

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith(pathResolve(CACHE_DIR, 'pass2-claims.json'));
    expect(mockUnlink).toHaveBeenCalledWith(pathResolve(CACHE_DIR, 'old-run.json'));
  });
});
