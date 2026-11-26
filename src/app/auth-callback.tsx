import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { EmptyState, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { space, useTheme } from '@/theme';

/**
 * Opened by the links in Supabase's emails (confirm sign-up, reset password).
 * The link itself is handled by AuthProvider; this screen waits until the
 * player is actually signed in before moving on, so the next screen's
 * sign-in guard lets them through.
 */
export default function AuthCallback() {
  const { c } = useTheme();
  const url = Linking.useLinkingURL();
  const { authLink, handleAuthUrl, clearAuthLink, session } = useAuth();

  useEffect(() => handleAuthUrl(url), [url, handleAuthUrl]);

  if (authLink?.error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg, backgroundColor: c.background }}>
        <EmptyState icon="link-outline" title="That link didn’t work" message={`${authLink.error} Try signing in, or ask for a new email.`} />
        <Button
          title="Go to sign in"
          onPress={() => {
            clearAuthLink();
            router.replace('/sign-in');
          }}
        />
      </View>
    );
  }

  if (authLink && session) {
    return <Redirect href={authLink.recovery ? '/reset-password' : '/'} />;
  }

  return <Loading />;
}
