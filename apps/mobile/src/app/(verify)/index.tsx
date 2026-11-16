import { FlaskConical, ScanFace, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Banner, Button, Screen, StateView, Text } from '@arc/ui';

import { api, describeError, errorCode } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { fill, strings } from '@/i18n';

type Step =
  { name: 'intro'; error?: string } | { name: 'running'; checkId: string } | { name: 'failed'; attemptsLeft: number };

// Provisional screen (no Figma design yet). The check itself runs behind the
// server's liveness provider; only the development stand-in ("stub") exists so
// far, so this screen offers its two outcomes instead of opening the camera.
export default function LivenessCheck() {
  const { signedIn, signOut } = useAuth();
  const [step, setStep] = useState<Step>({ name: 'intro' });
  const [busy, setBusy] = useState(false);
  const t = strings.liveness;

  const start = async () => {
    setBusy(true);
    try {
      const check = await api.liveness.start();
      setStep(
        check.provider === 'stub'
          ? { name: 'running', checkId: check.check_id }
          : { name: 'intro', error: t.unsupported },
      );
    } catch (caught) {
      if (errorCode(caught) === 'LIVENESS_ALREADY_PASSED') {
        await signedIn(await api.me()); // verified elsewhere: the root layout opens the app
        return;
      }
      setStep({ name: 'intro', error: describeError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const finish = async (checkId: string, outcome: 'pass' | 'fail') => {
    setBusy(true);
    try {
      const result = await api.liveness.complete(checkId, {
        stub_outcome: outcome,
      });
      if (result.status === 'passed') {
        await signedIn(result.user); // the root layout now opens the app
      } else {
        setStep({ name: 'failed', attemptsLeft: result.attempts_left });
      }
    } catch (caught) {
      const expired = errorCode(caught) === 'LIVENESS_CHECK_EXPIRED';
      setStep({
        name: 'intro',
        error: expired ? t.expired : describeError(caught),
      });
    } finally {
      setBusy(false);
    }
  };

  const logOut = <Button label={t.logOut} variant="ghost" disabled={busy} onPress={() => void signOut()} />;

  if (step.name === 'running') {
    return (
      <Screen
        centered
        footer={
          <>
            <Button label={t.stubPass} loading={busy} onPress={() => void finish(step.checkId, 'pass')} />
            <Button
              label={t.stubFail}
              variant="ghost"
              disabled={busy}
              onPress={() => void finish(step.checkId, 'fail')}
            />
          </>
        }
      >
        <View style={styles.content}>
          <Banner icon={FlaskConical} message={t.stubNotice} />
          <StateView icon={ScanFace} title={t.title} />
        </View>
      </Screen>
    );
  }

  if (step.name === 'failed') {
    const left = step.attemptsLeft;
    const message = left === 0 ? t.failedBodyNone : left === 1 ? t.failedBodyOne : fill(t.failedBody, { count: left });
    return (
      <Screen
        centered
        footer={
          <>
            {left > 0 ? <Button label={t.tryAgain} loading={busy} onPress={() => void start()} /> : null}
            {logOut}
          </>
        }
      >
        <StateView icon={TriangleAlert} title={t.failedTitle} message={message} />
      </Screen>
    );
  }

  return (
    <Screen
      centered
      footer={
        <>
          <Button label={t.start} loading={busy} onPress={() => void start()} />
          {logOut}
        </>
      }
    >
      <View style={styles.content}>
        <StateView icon={ScanFace} title={t.title} message={t.body} />
        <Text variant="body" align="center" color="textSecondary">
          {t.privacy}
        </Text>
        {step.error ? (
          <Text variant="body" align="center" color="danger" accessibilityRole="alert">
            {step.error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg },
});
