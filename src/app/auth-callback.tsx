import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { EmptyState, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { completeAuthLink, type AuthLinkResult } from '@/lib/auth-links';
import { space, useTheme } from '@/theme';

/**
 * Opened by the links in Supabase's emails (confirm sign-up, reset password).
 * The link carries a login token; this screen turns it into a session.
 */
export default function AuthCallback() {
  const { c } = useTheme();
  const url = Linking.useLinkingURL();
  const [result, setResult] = useState<AuthLinkResult | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    completeAuthLink(url).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (result?.status === 'signed-in') {
    return <Redirect href={result.type === 'recovery' ? '/reset-password' : '/'} />;
  }

  if (result?.status === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg, backgroundColor: c.background }}>
        <EmptyState icon="link-outline" title="That link didn’t work" message={`${result.message} Try signing in, or ask for a new email.`} />
        <Button title="Go to sign in" onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }

  return <Loading />;
}
