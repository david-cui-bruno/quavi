import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.quavi.app',
  appName: 'Quavi',
  webDir: 'dist',
  backgroundColor: '#F7F4EC',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
  },
  plugins: {
    Keyboard: { resize: KeyboardResize.Native },
  },
};

export default config;
