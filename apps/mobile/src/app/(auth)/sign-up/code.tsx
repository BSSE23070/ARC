import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api';
import { CodeEntry } from '@/features/auth/CodeEntry';
import { useSignup } from '@/features/auth/SignupContext';
import { fill, strings } from '@/i18n';

// Figma: A-OTP / A-OTP-WRONG (the code now goes to email).
export default function SignUpCode() {
  const router = useRouter();
  const { draft, update } = useSignup();
  const { resendAfter } = useLocalSearchParams<{ resendAfter?: string }>();

  if (!draft.email) return <Redirect href="/sign-up" />;

  return (
    <CodeEntry
      title={strings.signUp.codeTitle}
      message={fill(strings.signUp.codeBody, { email: draft.email })}
      submitLabel={strings.signUp.verify}
      resendAfterS={Number(resendAfter ?? 30)}
      onBack={() => router.back()}
      onSubmit={async (code) => {
        const { signup_token } = await api.auth.signupVerify(draft.email, code);
        update({ signupToken: signup_token });
        router.replace('/sign-up/account');
      }}
      onResend={async () => (await api.auth.signupStart(draft.email)).resend_after_s}
    />
  );
}
