import { ApiError, createApiClient, type SessionEndReason, type Tokens, type TokenStore } from './index';

const USER = {
  id: '5f0c7c1e-0000-4000-8000-000000000001',
  email: 'maryam@itu.edu.pk',
  username: 'maryam',
  status: 'active',
  liveness_status: 'pending',
  created_at: '2026-11-16T10:00:00Z',
};

function memoryStore(initial: Tokens | null = null): TokenStore & { current: Tokens | null } {
  const store = {
    current: initial,
    get: async () => store.current,
    set: async (tokens: Tokens) => {
      store.current = tokens;
    },
    clear: async () => {
      store.current = null;
    },
  };
  return store;
}

type Call = { url: string; method: string; body: unknown; auth: string | null };
type Reply = { status: number; body?: unknown };

/** A fake server: answers each call with whatever `handler` returns and records it. */
function fakeFetch(handler: (call: Call) => Reply | Promise<Reply>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body as string) : undefined,
      auth: headers.Authorization ?? null,
    };
    calls.push(call);
    const reply = await handler(call);
    return {
      status: reply.status,
      text: async () => (reply.body === undefined ? '' : JSON.stringify(reply.body)),
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const tokenResponse = (suffix: string) => ({
  access_token: `access-${suffix}`,
  refresh_token: `refresh-${suffix}`,
  token_type: 'bearer',
  expires_in: 900,
  user: USER,
});

const apiError = (status: number, code: string, details = {}) => ({
  status,
  body: { error: { code, message: `${code} message`, details } },
});

function setup(handler: (call: Call) => Reply | Promise<Reply>, tokens: Tokens | null = null) {
  const store = memoryStore(tokens);
  const ended: SessionEndReason[] = [];
  const { fetchImpl, calls } = fakeFetch(handler);
  const api = createApiClient({
    baseUrl: 'http://api.test',
    tokenStore: store,
    fetch: fetchImpl,
    onSessionEnded: (reason) => ended.push(reason),
  });
  return { api, store, calls, ended };
}

const SIGNED_IN: Tokens = { accessToken: 'access-old', refreshToken: 'refresh-old' };

describe('api client', () => {
  it('stores tokens after log-in and sends them on later calls', async () => {
    const { api, store, calls } = setup((call) =>
      call.url.endsWith('/auth/login') ? { status: 200, body: tokenResponse('1') } : { status: 200, body: USER },
    );

    const result = await api.auth.login({ identifier: 'maryam', password: 'pw', installation_id: 'i'.repeat(16) });
    expect(result).toEqual({ kind: 'signed_in', user: USER });
    expect(store.current).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await api.me();
    expect(calls[1]).toMatchObject({ url: 'http://api.test/api/v1/me', auth: 'Bearer access-1' });
  });

  it('reports a new-phone challenge instead of signing in', async () => {
    const { api, store } = setup(() => ({
      status: 202,
      body: { challenge: 'email_code', challenge_token: 'ct', email_hint: 'm***@itu.edu.pk', resend_after_s: 30 },
    }));
    const result = await api.auth.login({ identifier: 'maryam', password: 'pw', installation_id: 'i'.repeat(16) });
    expect(result).toEqual({
      kind: 'email_code',
      challengeToken: 'ct',
      emailHint: 'm***@itu.edu.pk',
      resendAfterS: 30,
    });
    expect(store.current).toBeNull();
  });

  it('refreshes an expired access token once and retries the call', async () => {
    const { api, store, calls, ended } = setup((call) => {
      if (call.url.endsWith('/auth/refresh')) return { status: 200, body: tokenResponse('new') };
      return call.auth === 'Bearer access-old' ? apiError(401, 'TOKEN_EXPIRED') : { status: 200, body: USER };
    }, SIGNED_IN);

    await expect(api.me()).resolves.toEqual(USER);
    expect(calls.map((c) => c.url.replace('http://api.test/api/v1', ''))).toEqual(['/me', '/auth/refresh', '/me']);
    expect(calls[1]!.body).toEqual({ refresh_token: 'refresh-old' });
    expect(store.current).toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
    expect(ended).toEqual([]);
  });

  it('shares one refresh between concurrent calls (refresh tokens are single-use)', async () => {
    const { api, calls } = setup(async (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { status: 200, body: tokenResponse('new') };
      }
      return call.auth === 'Bearer access-old' ? apiError(401, 'TOKEN_EXPIRED') : { status: 200, body: USER };
    }, SIGNED_IN);

    await Promise.all([api.me(), api.me(), api.me()]);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('ends the session when the refresh token is rejected', async () => {
    const { api, store, ended } = setup(
      (call) =>
        call.url.endsWith('/auth/refresh') ? apiError(401, 'SESSION_REVOKED') : apiError(401, 'TOKEN_EXPIRED'),
      SIGNED_IN,
    );
    await expect(api.me()).rejects.toMatchObject({ code: 'SESSION_ENDED' });
    expect(store.current).toBeNull();
    expect(ended).toEqual(['expired']);
  });

  it('ends the session at once when the server says it was revoked', async () => {
    const { api, store, calls, ended } = setup(() => apiError(401, 'SESSION_REVOKED'), SIGNED_IN);
    await expect(api.me()).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(calls).toHaveLength(1); // no pointless refresh attempt
    expect(store.current).toBeNull();
    expect(ended).toEqual(['expired']);
  });

  it('reports a suspended account', async () => {
    const { api, ended } = setup(() => apiError(403, 'ACCOUNT_SUSPENDED'), SIGNED_IN);
    await expect(api.me()).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(ended).toEqual(['suspended']);
  });

  it('keeps the session when the network is down', async () => {
    const store = memoryStore(SIGNED_IN);
    const ended: SessionEndReason[] = [];
    const api = createApiClient({
      baseUrl: 'http://api.test',
      tokenStore: store,
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
      onSessionEnded: (reason) => ended.push(reason),
    });

    const error = await api.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
    expect(store.current).toEqual(SIGNED_IN);
    expect(ended).toEqual([]);
  });

  it('exposes server error codes and details', async () => {
    const { api } = setup(() => apiError(400, 'OTP_INVALID', { attempts_remaining: 2 }));
    await expect(api.auth.signupVerify('maryam@itu.edu.pk', '000000')).rejects.toMatchObject({
      status: 400,
      code: 'OTP_INVALID',
      details: { attempts_remaining: 2 },
    });
  });

  it('logs out locally even when the server cannot be reached', async () => {
    const store = memoryStore(SIGNED_IN);
    const api = createApiClient({
      baseUrl: 'http://api.test',
      tokenStore: store,
      fetch: (async () => {
        throw new TypeError('offline');
      }) as unknown as typeof fetch,
    });
    await expect(api.auth.logout()).resolves.toBeUndefined();
    expect(store.current).toBeNull();
  });
});
