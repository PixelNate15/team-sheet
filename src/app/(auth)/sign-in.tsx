import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField, type TextFieldRef } from '@/components/Field';
import { Hero, Logo } from '@/components/Hero';
import { Text } from '@/components/Text';
import { APP_NAME } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

export default function SignIn() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextFieldRef>(null);

  async function signIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    // Passwords are not trimmed (the original silently stripped spaces).
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(errorMessage(e));
    // On success the root navigator switches to the signed-in screens.
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
        <Hero style={styles.hero}>
          <Logo />
          <Text variant="hero" style={{ color: c.onHero, marginTop: space.lg }}>
            {APP_NAME}
          </Text>
          <Text variant="body" style={{ color: c.onHeroMuted }}>
            Availability, selection, results and partner feedback for your tennis teams.
          </Text>
        </Hero>

        <View style={{ gap: space.lg }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={signIn}
          />
          {error ? (
            <Text variant="small" color="danger">
              {error}
            </Text>
          ) : null}
          <Button title="Sign in" onPress={signIn} loading={busy} />
          <Link href="/forgot-password" asChild>
            <Text variant="smallBold" color="accent" align="center" style={{ paddingVertical: space.sm }}>
              Forgot your password?
            </Text>
          </Link>
        </View>

        <View style={[styles.signup, { borderTopColor: c.border }]}>
          <Text variant="small" color="textMuted" align="center">
            New to the club?
          </Text>
          <Button title="Create an account" variant="secondary" onPress={() => router.push('/sign-up')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, gap: space.xl, flexGrow: 1 },
  hero: { paddingVertical: space.xxl },
  signup: { gap: space.md, paddingTop: space.xl, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 'auto' },
});
