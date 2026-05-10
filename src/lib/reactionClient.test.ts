import { describe, expect, it, vi } from 'vitest';
import { streamReactionText } from './reactionClient';

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function makeByteStream(chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

describe('streamReactionText', () => {
  it('streams deltas into the callback', async () => {
    const seen: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(makeStream(['The ', 'dial ', 'moved.'])));

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait: async () => {},
    });

    expect(seen).toEqual(['The ', 'The dial ', 'The dial moved.']);
  });

  it('retries 409 in-flight responses and then uses the eventual cached success', async () => {
    const seen: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('pending', {
          status: 409,
          headers: { 'X-Reaction-In-Flight': '1' },
        }),
      )
      .mockResolvedValueOnce(new Response(makeStream(['Filed.'])));
    const wait = vi.fn(async () => {});

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait,
    });

    expect(wait).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['Filed.']);
  });

  it('falls back after exhausting in-flight retries', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('pending', {
        status: 409,
        headers: { 'X-Reaction-In-Flight': '1' },
      }),
    );
    const wait = vi.fn(async () => {});

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(wait).toHaveBeenCalledTimes(4);
    expect(seen).toEqual([
      'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.',
    ]);
  });

  it('falls back for non-retryable non-ok responses', async () => {
    const seen: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('nope', { status: 500 }));

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait: async () => {},
    });

    expect(seen).toEqual([
      'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.',
    ]);
  });

  it('falls back for an empty successful stream', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(makeStream([])));

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait: async () => {},
    });

    expect(seen).toEqual([
      'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.',
    ]);
  });

  it('emits decoder flush text for a split multibyte sequence', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        makeByteStream([
          [240, 159],
          [146, 161],
        ]),
      ),
    );

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait: async () => {},
    });

    expect(seen.at(-1)).toBe('💡');
  });

  it('retries thrown fetches with the default sleep helper', async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(makeStream(['Recovered.'])));

    const promise = streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
    });

    await vi.advanceTimersByTimeAsync(150);
    await promise;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['Recovered.']);
    vi.useRealTimers();
  });

  it('keeps partial streamed text if the body errors mid-read', async () => {
    const seen: string[] = [];
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader() {
          let reads = 0;
          return {
            async read() {
              reads += 1;
              if (reads === 1) return { done: false, value: encoder.encode('Partial') };
              throw new Error('stream broke');
            },
          };
        },
      },
    } as unknown as Response);

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait: async () => {},
    });

    expect(seen).toEqual(['Partial']);
  });

  it('falls back after repeated thrown fetches', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('still down'));
    const wait = vi.fn(async () => {});

    await streamReactionText('pick-1', {
      fetchImpl,
      onText: (text) => seen.push(text),
      wait,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(wait).toHaveBeenCalledTimes(4);
    expect(seen).toEqual([
      'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.',
    ]);
  });
});
