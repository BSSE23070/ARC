import { ApiError, createApiClient, type SessionEndReason } from '@arc/api-client';

import { tokenStore } from '@/auth/storage';
import { API_URL } from '@/config';
import { fill, strings } from '@/i18n';

type Listener = (reason: SessionEndReason) => void;
const listeners = new Set<Listener>();

/** Fires when the server ends the session (revoked, expired or suspended). */
export const sessionEvents = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const api = createApiClient({
  baseUrl: API_URL,
  tokenStore,
  onSessionEnded: (reason) => listeners.forEach((listener) => listener(reason)),
});

/** A message safe to show the user for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return strings.errors.network;
    if (error.code === 'OTP_INVALID') {
      const remaining = Number(error.details.attempts_remaining ?? 0);
      return remaining === 1 ? strings.errors.otpInvalidOne : fill(strings.errors.otpInvalid, { count: remaining });
    }
    return error.message; // server messages are written for users
  }
  return strings.errors.generic;
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}
