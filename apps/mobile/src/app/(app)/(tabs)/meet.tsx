import { Users } from 'lucide-react-native';

import { ComingSoon } from '@/features/shell/ComingSoon';
import { strings } from '@/i18n';

// Shell only for now: the matching module arrives in a later phase.
export default function Meet() {
  return (
    <ComingSoon tab={strings.tabs.meet} icon={Users} title={strings.shell.meetTitle} message={strings.shell.meetBody} />
  );
}
