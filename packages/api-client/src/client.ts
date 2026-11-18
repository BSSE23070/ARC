import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type User = Schemas['UserOut'];
type ApiPath = keyof paths;

export type Tokens = { accessToken: string; refreshToken: string };

/** Where the app keeps its tokens (the phone's secure storage). */
export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

/** Why the server ended the session without the user asking. */
export type SessionEndReason = 'expired' | 'suspended';

/** Every failed call throws this. Switch on `code`; show `message` to the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The phone could not reach the server at all. */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

export type LoginResult =
  | { kind: 'signed_in'; user: User }
  | { kind: 'email_code'; challengeToken: string; emailHint: string; resendAfterS: number };

export type ApiClientOptions = {
  baseUrl: string;
  tokenStore: TokenStore;
  /** Called when the server ends the session (revoked, expired or suspended). */
  onSessionEnded?: (reason: SessionEndReason) => void;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Outcome = { status: number; data: unknown };

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, tokenStore, onSessionEnded, timeoutMs = 15_000 } = options;
  const doFetch = options.fetch ?? fetch;
  let refreshInFlight: Promise<Tokens | null> | null = null;

  async function send(method: string, path: ApiPath, body?: unknown, accessToken?: string): Promise<Outcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(baseUrl + path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', "Can't reach Arc. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }
    const text = response.status === 204 ? '' : await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    return { status: response.status, data };
  }

  function toError({ status, data }: Outcome): ApiError {
    const error = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })
      ?.error;
    return new ApiError(
      status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details ?? {},
    );
  }

  function unwrap<T>(outcome: Outcome): T {
    if (outcome.status >= 400) throw toError(outcome);
    return outcome.data as T;
  }

  async function endSession(reason: SessionEndReason): Promise<void> {
    await tokenStore.clear();
    onSessionEnded?.(reason);
  }

  async function saveTokens(response: Schemas['TokenResponse']): Promise<User> {
    await tokenStore.set({ accessToken: response.access_token, refreshToken: response.refresh_token });
    return response.user;
  }

  /** Swaps the refresh token for a new pair. Concurrent callers share one request. */
  function refresh(): Promise<Tokens | null> {
    refreshInFlight ??= (async () => {
      const current = await tokenStore.get();
      if (!current) return null;
      const outcome = await send('POST', '/api/v1/auth/refresh', { refresh_token: current.refreshToken });
      if (outcome.status === 401 || outcome.status === 403) {
        await endSession(toError(outcome).code === 'ACCOUNT_SUSPENDED' ? 'suspended' : 'expired');
        return null;
      }
      const data = unwrap<Schemas['TokenResponse']>(outcome);
      await saveTokens(data);
      return { accessToken: data.access_token, refreshToken: data.refresh_token };
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  /** A call that needs the user to be signed in. Refreshes the access token once if it has expired. */
  async function authed<T>(method: string, path: ApiPath, body?: unknown): Promise<T> {
    const tokens = await tokenStore.get();
    if (!tokens) throw new ApiError(401, 'AUTH_REQUIRED', 'Please log in.');

    let outcome = await send(method, path, body, tokens.accessToken);
    if (outcome.status === 401) {
      const code = toError(outcome).code;
      if (code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID') {
        const renewed = await refresh();
        if (!renewed) throw new ApiError(401, 'SESSION_ENDED', 'Please log in again.');
        outcome = await send(method, path, body, renewed.accessToken);
      }
    }
    if (outcome.status === 401) {
      await endSession('expired');
    } else if (outcome.status === 403 && toError(outcome).code === 'ACCOUNT_SUSPENDED') {
      await endSession('suspended');
    }
    return unwrap<T>(outcome);
  }

  async function open<T>(method: string, path: ApiPath, body?: unknown): Promise<T> {
    return unwrap<T>(await send(method, path, body));
  }

  return {
    auth: {
      /** Emails a sign-up code. */
      signupStart: (email: string) =>
        open<Schemas['Accepted']>('POST', '/api/v1/auth/signup/start', {
          email,
        } satisfies Schemas['SignupStartRequest']),

      signupVerify: (email: string, code: string) =>
        open<Schemas['SignupVerifyResponse']>('POST', '/api/v1/auth/signup/verify', {
          email,
          code,
        } satisfies Schemas['SignupVerifyRequest']),

      /** Creates the account and signs this phone in. */
      signupComplete: async (body: Schemas['SignupCompleteRequest']): Promise<User> =>
        saveTokens(await open<Schemas['TokenResponse']>('POST', '/api/v1/auth/signup/complete', body)),

      /** Signs in, or reports that this phone needs an email code first. */
      login: async (body: Schemas['LoginRequest']): Promise<LoginResult> => {
        const data = await open<Schemas['TokenResponse'] | Schemas['LoginChallengeResponse']>(
          'POST',
          '/api/v1/auth/login',
          body,
        );
        if ('challenge' in data) {
          return {
            kind: 'email_code',
            challengeToken: data.challenge_token,
            emailHint: data.email_hint,
            resendAfterS: data.resend_after_s,
          };
        }
        return { kind: 'signed_in', user: await saveTokens(data) };
      },

      loginVerify: async (challengeToken: string, code: string): Promise<User> =>
        saveTokens(
          await open<Schemas['TokenResponse']>('POST', '/api/v1/auth/login/verify', {
            challenge_token: challengeToken,
            code,
          } satisfies Schemas['LoginVerifyRequest']),
        ),

      loginResend: (challengeToken: string) =>
        open<Schemas['Accepted']>('POST', '/api/v1/auth/login/resend', {
          challenge_token: challengeToken,
        } satisfies Schemas['LoginResendRequest']),

      /** Signs this phone out. Works offline: local tokens are always cleared. */
      logout: async (): Promise<void> => {
        const tokens = await tokenStore.get();
        await tokenStore.clear();
        if (!tokens) return;
        try {
          await send('POST', '/api/v1/auth/logout', {
            refresh_token: tokens.refreshToken,
          } satisfies Schemas['LogoutRequest']);
        } catch {
          // Offline: the server-side session simply expires on its own.
        }
      },

      passwordForgot: (email: string) =>
        open<Schemas['Accepted']>('POST', '/api/v1/auth/password/forgot', {
          email,
        } satisfies Schemas['PasswordForgotRequest']),

      passwordReset: (body: Schemas['PasswordResetRequest']) =>
        open<void>('POST', '/api/v1/auth/password/reset', body),

      passwordChange: (body: Schemas['PasswordChangeRequest']) =>
        authed<void>('POST', '/api/v1/auth/password/change', body),
    },

    me: () => authed<User>('GET', '/api/v1/me'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
