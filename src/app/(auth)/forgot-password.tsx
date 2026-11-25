import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/Bits';
import { Button } from '@/components/Button';
import { EmailLinkWarning } from '@/components/EmailLinkWarning';
import { TextField } from '@/components/Field';
import { Text } from '@/components/Text';
import { authRedirectUrl } from '@/lib/auth-links';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

/**
 * Password reset by email. The link opens the app (auth-callback), which signs
 * the player in and sends them to reset-password to choose a new password.
 */
export default function ForgotPassword() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() });
    setBusy(false);
    if (e) setError(errorMessage(e));
    else setSent(true);
  }

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      style={{ backgroundColor: c.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + 56, gap: space.lg }}>
      {sent ? (
        <>
          <EmptyState icon="mail-open-outline" title="Email sent" message={`If ${email.trim()} has an account, a reset link is on its way.`} />
          <Button title="Back to sign in" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <View style={{ gap: space.xs }}>
            <Text variant="title">Reset your password</Text>
            <Text variant="body" color="textMuted">
              We’ll email you a link to choose a new one.
            </Text>
          </View>
          <EmailLinkWarning />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={error}
            onSubmitEditing={send}
          />
          <Button title="Send reset link" onPress={send} loading={busy} />
        </>
      )}
    </ScrollView>
  );
}
