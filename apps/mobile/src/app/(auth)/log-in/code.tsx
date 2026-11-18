import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { CodeEntry } from '@/features/auth/CodeEntry';
import { fill, strings } from '@/i18n';

// PROVISIONAL: new-phone confirmation, built on the Figma A-EMAIL-CODE pattern.
export default function LogInCode() {
  const router = useRouter();
  const { signedIn } = useAuth();
  const params = useLocalSearchParams<{ challengeToken?: string; emailHint?: string; resendAfter?: string }>();
  const challengeToken = params.challengeToken;

  if (!challengeToken) return <Redirect href="/log-in" />;

  return (
    <CodeEntry
      title={strings.logIn.newPhoneTitle}
      message={fill(strings.logIn.newPhoneBody, { email: params.emailHint ?? '' })}
      submitLabel={strings.signUp.verify}
      resendAfterS={Number(params.resendAfter ?? 30)}
      onBack={() => router.back()}
      onSubmit={async (code) => signedIn(await api.auth.loginVerify(challengeToken, code))}
      onResend={async () => (await api.auth.loginResend(challengeToken)).resend_after_s}
    />
  );
}
