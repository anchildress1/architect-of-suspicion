const FALLBACK_REACTION =
  'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.';

const RETRY_DELAYS_MS = [150, 300, 600, 1_200] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StreamReactionOptions {
  fetchImpl?: typeof fetch;
  onText: (text: string) => void;
  wait?: (ms: number) => Promise<void>;
}

function pushFallback(onText: (text: string) => void): void {
  onText(FALLBACK_REACTION);
}

async function fetchReaction(fetchImpl: typeof fetch, pickId: string): Promise<Response> {
  return await fetchImpl('/api/reaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pick_id: pickId }),
  });
}

function isInFlightResponse(res: Response): boolean {
  return res.status === 409 && res.headers.get('X-Reaction-In-Flight') === '1';
}

async function retryOrFallback(
  attempt: number,
  wait: (ms: number) => Promise<void>,
  onText: (text: string) => void,
): Promise<boolean> {
  if (attempt < RETRY_DELAYS_MS.length) {
    await wait(RETRY_DELAYS_MS[attempt]);
    return true;
  }
  pushFallback(onText);
  return false;
}

async function readReactionBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onText: (text: string) => void,
): Promise<{ text: string; complete: boolean }> {
  const decoder = new TextDecoder();
  let collected = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        collected += decoder.decode(value, { stream: true });
        onText(collected);
      }
    }

    const flush = decoder.decode();
    if (flush) {
      collected += flush;
      onText(collected);
    }
    return { text: collected, complete: true };
  } catch {
    return { text: collected, complete: false };
  }
}

async function performReactionAttempt(
  pickId: string,
  fetchImpl: typeof fetch,
  onText: (text: string) => void,
): Promise<'done' | 'retry'> {
  let res: Response;

  try {
    res = await fetchReaction(fetchImpl, pickId);
  } catch {
    return 'retry';
  }

  if (isInFlightResponse(res)) return 'retry';

  if (!res.ok || !res.body) {
    pushFallback(onText);
    return 'done';
  }

  const outcome = await readReactionBody(res.body.getReader(), onText);
  if (!outcome.complete && outcome.text.trim()) return 'done';
  if (!outcome.text.trim()) pushFallback(onText);
  return 'done';
}

export async function streamReactionText(
  pickId: string,
  options: StreamReactionOptions,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? sleep;

  for (let attempt = 0; ; attempt++) {
    if ((await performReactionAttempt(pickId, fetchImpl, options.onText)) === 'retry') {
      if (await retryOrFallback(attempt, wait, options.onText)) continue;
    }
    return;
  }
}
