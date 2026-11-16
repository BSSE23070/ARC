import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { Tokens, TokenStore, User } from '@arc/api-client';

// Everything here lives in the phone's encrypted storage (Android Keystore).
const TOKENS_KEY = 'arc.session';
const USER_KEY = 'arc.user';
const INSTALLATION_KEY = 'arc.installation';

let cachedTokens: Tokens | null | undefined;

export const tokenStore: TokenStore = {
  async get() {
    if (cachedTokens === undefined) {
      const raw = await SecureStore.getItemAsync(TOKENS_KEY);
      cachedTokens = raw ? (JSON.parse(raw) as Tokens) : null;
    }
    return cachedTokens;
  },
  async set(tokens) {
    cachedTokens = tokens;
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
  },
  async clear() {
    cachedTokens = null;
    await SecureStore.deleteItemAsync(TOKENS_KEY);
  },
};

/** The last known user, so the app can open while offline. */
export const userCache = {
  async get(): Promise<User | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  set: (user: User) => SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  clear: () => SecureStore.deleteItemAsync(USER_KEY),
};

/**
 * A random ID for this app installation. The server asks for an email code
 * the first time an account signs in from an installation it hasn't seen.
 */
export async function getInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_KEY, created);
  return created;
}
