import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';

import { Button, Screen, StateView } from '@arc/ui';

import { strings } from '@/i18n';

// Figma: A-UNDER18
export default function Under18() {
  const router = useRouter();
  return (
    <Screen
      centered
      footer={<Button label={strings.common.close} onPress={() => router.dismissTo('/')} />}
    >
      <StateView icon={Lock} title={strings.signUp.under18Title} message={strings.signUp.under18Body} />
    </Screen>
  );
}
