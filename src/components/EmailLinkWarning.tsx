import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { authRedirectUrl } from '@/lib/auth-links';
import { emailLinksReach } from '@/lib/email-links';
import { radius, space, useTheme } from '@/theme';

import { Text } from './Text';

/**
 * Development only: warns when this Expo Go session can't receive email links
 * (Supabase would send them to localhost instead). Renders nothing in real builds.
 */
export function EmailLinkWarning() {
  const { c } = useTheme();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__) return;
    let live = true;
    authRedirectUrl().then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, []);

  if (!__DEV__ || !url || emailLinksReach(url)) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: c.warningSoft, borderRadius: radius.md, padding: space.md, gap: space.xs }}>
      <Text variant="smallBold" style={{ color: c.warning }}>
        Test session: email links won’t open the app
      </Text>
      <Text variant="small" color="text">
        This copy of the app was opened from a local network address, so links in emails go to localhost. Restart with
        “npm run start:tunnel” and open the app again, then send the email again.
      </Text>
      <Text variant="caption" color="textMuted" selectable>
        {url}
      </Text>
    </View>
  );
}
