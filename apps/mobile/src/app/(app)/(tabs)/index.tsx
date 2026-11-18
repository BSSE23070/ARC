import { Compass } from 'lucide-react-native';

import { ComingSoon } from '@/features/shell/ComingSoon';
import { strings } from '@/i18n';

// Shell only for now: the events and feed module arrives in a later phase.
export default function Explore() {
  return (
    <ComingSoon
      tab={strings.tabs.explore}
      icon={Compass}
      title={strings.shell.exploreTitle}
      message={strings.shell.exploreBody}
    />
  );
}
