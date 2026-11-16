import { ScanLine } from 'lucide-react-native';

import { ComingSoon } from '@/features/shell/ComingSoon';
import { strings } from '@/i18n';

// Shell only for now: the verification module arrives in a later phase.
export default function CheckIn() {
  return (
    <ComingSoon
      tab={strings.tabs.checkIn}
      icon={ScanLine}
      title={strings.shell.checkInTitle}
      message={strings.shell.checkInBody}
    />
  );
}
