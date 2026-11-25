import { View } from 'react-native';

import { emailLinksReachThisApp } from '@/lib/auth-links';
import { radius, space, useTheme } from '@/theme';

import { Text } from './Text';

/**
 * Development only: warns when this Expo Go session can't receive email links
 * (Supabase would send them to localhost instead). Renders nothing in real builds.
 */
export function EmailLinkWarning() {
  const { c } = useTheme();
  if (!__DEV__ || emailLinksReachThisApp()) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: c.warningSoft, borderRadius: radius.md, padding: space.md, gap: space.xs }}>
      <Text variant="smallBold" style={{ color: c.warning }}>
        Test session: email links won’t open the app
      </Text>
      <Text variant="small" color="text">
        This copy of the app was opened from a local network address, so links in emails go to localhost. Restart with
        “npm run start:tunnel” and scan the new QR code, then send the email again.
      </Text>
    </View>
  );
}
