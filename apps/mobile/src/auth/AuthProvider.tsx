import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, type SessionEndReason, type User } from '@arc/api-client';

import { api, sessionEvents } from '@/api';
import { tokenStore, userCache } from '@/auth/storage';

type AuthState =
  { status: 'loading' } | { status: 'signedOut'; ended?: SessionEndReason } | { status: 'signedIn'; user: User };

type AuthContextValue = {
  state: AuthState;
  /** Call after the API client has stored tokens (sign-up or log-in finished). */
  signedIn: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
  /** Dismisses the "you've been logged out" notice. */
  acknowledgeEnded: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const unsubscribe = sessionEvents.subscribe((reason) => {
      void userCache.clear();
      setState({ status: 'signedOut', ended: reason });
    });

    // Restore the session on launch. Users stay signed in until they log out
    // or the server ends the session.
    void (async () => {
      if (!(await tokenStore.get())) {
        setState({ status: 'signedOut' });
        return;
      }
      try {
        const user = await api.me();
        await userCache.set(user);
        setState({ status: 'signedIn', user });
      } catch (error) {
        // Offline (or the server is having a bad moment): open with the last
        // known user. A rejected session was already handled by the listener.
        const serverSaidNo = error instanceof ApiError && !error.isNetworkError && error.status < 500;
        const cached = serverSaidNo ? null : await userCache.get();
        setState((current) => {
          if (current.status !== 'loading') return current;
          return cached ? { status: 'signedIn', user: cached } : { status: 'signedOut' };
        });
      }
    })();

    return unsubscribe;
  }, []);

  const signedIn = useCallback(async (user: User) => {
    await userCache.set(user);
    setState({ status: 'signedIn', user });
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.logout();
    await userCache.clear();
    setState({ status: 'signedOut' });
  }, []);

  const acknowledgeEnded = useCallback(() => setState({ status: 'signedOut' }), []);

  const value = useMemo(
    () => ({ state, signedIn, signOut, acknowledgeEnded }),
    [state, signedIn, signOut, acknowledgeEnded],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in user. Only call from screens inside the (app) group. */
export function useUser(): User {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useUser needs a signed-in user');
  return state.user;
}
