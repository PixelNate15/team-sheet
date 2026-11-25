import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Hero, Logo } from '@/components/Hero';
import { Text } from '@/components/Text';
import { joinClub } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { font, radius, space, useTheme } from '@/theme';

export default function JoinClub() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { me, refreshMe, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (code.trim().length !== 6) {
      setError('Club codes are 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinClub(code);
      await refreshMe();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
        <Hero>
          <Logo size={52} />
          <Text variant="title" style={{ color: c.onHero, marginTop: space.lg }}>
            Welcome{me ? `, ${me.profile.first_name}` : ''}!
          </Text>
          <Text variant="body" style={{ color: c.onHeroMuted }}>
            Join your club to see fixtures, tell your captain when you’re free and track your form.
          </Text>
        </Hero>

        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="heading">Join with a club code</Text>
            <Text variant="small" color="textMuted">
              Ask your captain or club admin for the 6-character code.
            </Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123"
              placeholderTextColor={c.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              onSubmitEditing={join}
              accessibilityLabel="Club code"
              style={[styles.code, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: error ? c.danger : 'transparent' }]}
            />
            {error ? (
              <Text variant="small" color="danger">
                {error}
              </Text>
            ) : null}
            <Button title="Join club" onPress={join} loading={busy} disabled={code.length !== 6} />
          </View>
        </Card>

        <Card tone="soft">
          <View style={{ gap: space.md }}>
            <Text variant="heading">Running a club?</Text>
            <Text variant="small" color="textMuted">
              Set up your club, first team and season. You’ll get a code to share with your players.
            </Text>
            <Button title="Create a club" variant="secondary" icon="add-circle-outline" onPress={() => router.push('/onboarding/create')} />
          </View>
        </Card>

        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  code: {
    fontSize: 30,
    fontFamily: font.display,
    letterSpacing: 10,
    textAlign: 'center',
    paddingVertical: space.lg,
    borderRadius: radius.md,
    borderWidth: 2,
  },
});
