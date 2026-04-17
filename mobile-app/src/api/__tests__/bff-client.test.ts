import { setupServer } from 'msw/node';

import * as legacyFs from 'expo-file-system/legacy';

import {
  createBffClient,
  isTranslationError,
  TranslationError,
} from '../bff-client';
import { BFF_TEST_BASE_URL, fixtures, handlers } from './msw-handlers';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
});
afterAll(() => server.close());

type SleepCall = { ms: number; at: number };

function makeClient(overrides?: { sleepMs?: (ms: number) => Promise<void> }) {
  const sleepCalls: SleepCall[] = [];
  const defaultSleep = async (ms: number) => {
    sleepCalls.push({ ms, at: Date.now() });
  };
  const client = createBffClient({
    baseUrl: BFF_TEST_BASE_URL,
    sleepMs: overrides?.sleepMs ?? defaultSleep,
    nowMs: () => Date.now(),
  });
  return { client, sleepCalls };
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) {
    out.push(v);
  }
  return out;
}

describe('bff-client', () => {
  describe('postTranslateSpeak', () => {
    test('C1 — upload happy path returns UploadAccepted (camelCase)', async () => {
      (legacyFs.uploadAsync as jest.Mock).mockResolvedValueOnce({
        status: 202,
        body: JSON.stringify(fixtures.uploadAccepted()),
        headers: {},
      });

      const { client } = makeClient();
      const accepted = await client.postTranslateSpeak(
        'file:///cache/in-flight/clip.m4a',
        'english_to_wolof',
      );

      expect(accepted).toEqual({
        requestId: 'a1b2c3d4',
        status: 'queued',
        stage: 'queued',
        direction: 'english_to_wolof',
        statusUrl: '/api/requests/a1b2c3d4',
        pollAfterMs: 500,
      });

      const call = (legacyFs.uploadAsync as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('/api/translate-speak');
      expect(call[1]).toBe('file:///cache/in-flight/clip.m4a');
      expect(call[2]).toMatchObject({
        fieldName: 'file',
        httpMethod: 'POST',
        parameters: { direction: 'english_to_wolof' },
      });
    });

    test('C2 — 400 bad direction throws upload_failed httpStatus=400 retryable=false', async () => {
      (legacyFs.uploadAsync as jest.Mock).mockResolvedValueOnce({
        status: 400,
        body: JSON.stringify(fixtures.uploadBadDirection()),
        headers: {},
      });

      const { client } = makeClient();
      await expect(
        client.postTranslateSpeak('file:///c/x.m4a', 'english_to_wolof'),
      ).rejects.toMatchObject({
        kind: 'upload_failed',
        httpStatus: 400,
        retryable: false,
      });
    });

    test('C3 — network error throws upload_failed retryable=true', async () => {
      (legacyFs.uploadAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Network request failed'),
      );

      const { client } = makeClient();
      await expect(
        client.postTranslateSpeak('file:///c/x.m4a', 'english_to_wolof'),
      ).rejects.toMatchObject({
        kind: 'upload_failed',
        retryable: true,
      });
    });

    test('C3a — upload stalled past timeoutAtMs rejects client_timeout retryable=true', async () => {
      (legacyFs.uploadAsync as jest.Mock).mockImplementationOnce(
        () => new Promise(() => {}),
      );

      let now = 1_000_000;
      const client = createBffClient({
        baseUrl: BFF_TEST_BASE_URL,
        nowMs: () => now,
        sleepMs: async (ms) => {
          now += ms;
        },
      });

      jest.useFakeTimers({ doNotFake: ['performance'] });
      try {
        const captured = client
          .postTranslateSpeak('file:///c/x.m4a', 'english_to_wolof', {
            timeoutAtMs: now + 100,
          })
          .then(
            () => ({ resolved: true as const }),
            (err: unknown) => ({ resolved: false as const, err }),
          );
        await jest.advanceTimersByTimeAsync(150);
        const outcome = await captured;
        expect(outcome).toMatchObject({
          resolved: false,
          err: { kind: 'client_timeout', retryable: true },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    test('C4 — malformed JSON body throws malformed_response retryable=false', async () => {
      (legacyFs.uploadAsync as jest.Mock).mockResolvedValueOnce({
        status: 202,
        body: '<html>not json</html>',
        headers: {},
      });

      const { client } = makeClient();
      await expect(
        client.postTranslateSpeak('file:///c/x.m4a', 'english_to_wolof'),
      ).rejects.toMatchObject({
        kind: 'malformed_response',
        retryable: false,
      });
    });
  });

  describe('pollUntilTerminal', () => {
    test('C5 — queued→processing→completed yields intermediate stages and ends completed', async () => {
      server.use(handlers.pollTransientThenComplete('a1b2c3d4'));

      const { client } = makeClient();
      const states = await collect(
        client.pollUntilTerminal('a1b2c3d4', { timeoutAtMs: Date.now() + 60_000 }),
      );

      const stages = states.map((s) => s.stage);
      expect(stages).toEqual(['queued', 'transcribing', 'translating', 'completed']);
      expect(states[states.length - 1]).toMatchObject({
        requestId: 'a1b2c3d4',
        status: 'completed',
        result: expect.objectContaining({
          transcribedText: 'Good morning',
          translatedText: 'Jamm nga fanaan',
          outputMode: 'wolof_audio',
          audioUrl: '/api/requests/a1b2c3d4/audio',
        }),
      });
    });

    test('C6 — 1×503 auto-retries with 1 s backoff then succeeds', async () => {
      server.use(handlers.pollFailingThenComplete('a1b2c3d4', 1, 503));

      const { client, sleepCalls } = makeClient();
      const states = await collect(
        client.pollUntilTerminal('a1b2c3d4', { timeoutAtMs: Date.now() + 60_000 }),
      );

      expect(states[states.length - 1].status).toBe('completed');
      expect(sleepCalls.some((c) => c.ms === 1000)).toBe(true);
    });

    test('C7 — 3×503 exhausts retries and throws poll_failed retryable=true', async () => {
      server.use(handlers.pollAlways5xx('a1b2c3d4', 503));

      const { client, sleepCalls } = makeClient();
      const run = collect(
        client.pollUntilTerminal('a1b2c3d4', { timeoutAtMs: Date.now() + 600_000 }),
      );

      await expect(run).rejects.toMatchObject({
        kind: 'poll_failed',
        retryable: true,
      });
      const backoffs = sleepCalls.map((c) => c.ms).filter((ms) => ms >= 1000);
      expect(backoffs).toEqual(expect.arrayContaining([1000, 3000, 9000]));
    });

    test('C8 — terminal failed throws server_failed retryable=false', async () => {
      server.use(handlers.pollTerminalFailed('a1b2c3d4'));

      const { client } = makeClient();
      await expect(
        collect(
          client.pollUntilTerminal('a1b2c3d4', { timeoutAtMs: Date.now() + 60_000 }),
        ),
      ).rejects.toMatchObject({
        kind: 'server_failed',
        retryable: false,
      });
    });

    test('C9 — 404 throws server_failed retryable=false', async () => {
      server.use(handlers.pollNotFound('a1b2c3d4'));

      const { client } = makeClient();
      await expect(
        collect(
          client.pollUntilTerminal('a1b2c3d4', { timeoutAtMs: Date.now() + 60_000 }),
        ),
      ).rejects.toMatchObject({
        kind: 'server_failed',
        retryable: false,
        httpStatus: 404,
      });
    });

    test('C10 — client-side timeout when stage stays on processing past timeoutAtMs', async () => {
      server.use(handlers.pollStuckOnProcessing('a1b2c3d4'));

      let now = 1_000_000;
      const client = createBffClient({
        baseUrl: BFF_TEST_BASE_URL,
        nowMs: () => now,
        sleepMs: async (ms) => {
          now += ms;
        },
      });

      await expect(
        collect(client.pollUntilTerminal('a1b2c3d4', { timeoutAtMs: 1_005_000 })),
      ).rejects.toMatchObject({
        kind: 'client_timeout',
        retryable: true,
      });
    });

    test('C13 — casing boundary: wire snake_case becomes camelCase, unknown keys ignored for domain logic', async () => {
      server.use(handlers.pollWithExtraUnknownKeys('a1b2c3d4'));

      const { client } = makeClient();
      const gen = client.pollUntilTerminal('a1b2c3d4', {
        timeoutAtMs: Date.now() + 60_000,
      });
      const first = await gen.next();
      await gen.return(undefined as never);

      expect(first.value).toMatchObject({
        requestId: 'a1b2c3d4',
        stage: 'transcribing',
        stageDetail: 'Running transcribing.',
        pollAfterMs: 500,
      });
      const asAny = first.value as unknown as Record<string, unknown>;
      expect(asAny.request_id).toBeUndefined();
      expect(asAny.stage_detail).toBeUndefined();
    });

    test('C14 — pollAfterMs from response is honored between polls', async () => {
      server.use(handlers.pollWithCustomPollAfterMs('a1b2c3d4', 1500));

      const { client, sleepCalls } = makeClient();
      const gen = client.pollUntilTerminal('a1b2c3d4', {
        timeoutAtMs: Date.now() + 60_000,
      });

      await gen.next();
      await gen.next();
      await gen.return(undefined as never);

      expect(sleepCalls.some((c) => c.ms === 1500)).toBe(true);
    });
  });

  describe('downloadAudio', () => {
    test('C11 — happy path returns local file:// URI under document/audio/', async () => {
      (legacyFs.downloadAsync as jest.Mock).mockResolvedValueOnce({
        status: 200,
        uri: 'file:///document/audio/a1b2c3d4.m4a',
      });

      const { client } = makeClient();
      const uri = await client.downloadAudio('a1b2c3d4');

      expect(uri).toBe('file:///document/audio/a1b2c3d4.m4a');
      const call = (legacyFs.downloadAsync as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('/api/requests/a1b2c3d4/audio');
      expect(call[1]).toContain('audio/a1b2c3d4.m4a');
    });

    test('C12 — 404 returns null (graceful degradation, no throw)', async () => {
      (legacyFs.downloadAsync as jest.Mock).mockResolvedValueOnce({
        status: 404,
        uri: '',
      });

      const { client } = makeClient();
      const uri = await client.downloadAudio('a1b2c3d4');
      expect(uri).toBeNull();
    });
  });

  describe('checkHealth', () => {
    test('C15 — /api/health returns { status: "ok" }', async () => {
      server.use(handlers.healthOk());

      const { client } = makeClient();
      await expect(client.checkHealth()).resolves.toEqual({ status: 'ok' });
    });
  });

  describe('TranslationError helpers', () => {
    test('isTranslationError identifies instances', () => {
      const err = new TranslationError({
        kind: 'upload_failed',
        message: 'boom',
        retryable: true,
      });
      expect(isTranslationError(err)).toBe(true);
      expect(isTranslationError(new Error('boom'))).toBe(false);
    });
  });
});
