import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** What the sign-up screens collect before the account is created. Held in
 * memory only; nothing is written to the phone until sign-up succeeds. */
export type SignupDraft = {
  email: string;
  signupToken: string;
  username: string;
  password: string;
  /** Set when the server rejects the username or password at the last step,
   * so the "Create your login" screen can show why. */
  accountError: { field: 'username' | 'password'; message: string } | null;
};

const EMPTY: SignupDraft = { email: '', signupToken: '', username: '', password: '', accountError: null };

type SignupContextValue = {
  draft: SignupDraft;
  update: (changes: Partial<SignupDraft>) => void;
  reset: () => void;
};

const SignupContext = createContext<SignupContextValue | null>(null);

export function SignupProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SignupDraft>(EMPTY);
  const update = useCallback(
    (changes: Partial<SignupDraft>) => setDraft((current) => ({ ...current, ...changes })),
    [],
  );
  const reset = useCallback(() => setDraft(EMPTY), []);
  const value = useMemo(() => ({ draft, update, reset }), [draft, update, reset]);
  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>;
}

export function useSignup(): SignupContextValue {
  const value = useContext(SignupContext);
  if (!value) throw new Error('useSignup must be used inside <SignupProvider>');
  return value;
}
