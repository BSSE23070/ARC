import { Camera } from 'lucide-react-native';

import { ComingSoon } from '@/features/shell/ComingSoon';
import { strings } from '@/i18n';

// Shell only for now: the Photobooth module arrives in a later phase.
export default function Photobooth() {
  return (
    <ComingSoon
      tab={strings.tabs.photobooth}
      icon={Camera}
      title={strings.shell.photoboothTitle}
      message={strings.shell.photoboothBody}
    />
  );
}
