import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { EmptyState } from '@/components/Bits';
import { Button } from '@/components/Button';
import { EmailLinkWarning } from '@/components/EmailLinkWarning';
import { TextField } from '@/components/Field';
import { Text } from '@/components/Text';
import { authRedirectUrl } from '@/lib/auth-links';
import { PRIVACY_POLICY_URL } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/theme';

// Letters plus spaces, hyphens and apostrophes (the original rejected "O'Neil" and "Smith-Jones").
const name = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(50, 'Keep it under 50 characters')
  .regex(/^[\p{L}][\p{L}' -]*$/u, 'Use letters, spaces, hyphens or apostrophes');

const schema = z
  .object({
    firstName: name,
    surname: name,
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
    confirm: z.string(),
    consent: z.literal(true, { message: 'Please confirm to continue' }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });

type Errors = Partial<Record<'firstName' | 'surname' | 'email' | 'password' | 'confirm' | 'consent' | 'form', string>>;

export default function SignUp() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ firstName: '', surname: '', email: '', password: '', confirm: '', consent: false });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const e: Errors = {};
      for (const issue of parsed.error.issues) e[issue.path[0] as keyof Errors] ??= issue.message;
      setErrors(e);
      return;
    }
    setErrors({});
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { first_name: parsed.data.firstName, surname: parsed.data.surname },
        // The confirmation link opens the app, which signs the player straight in.
        emailRedirectTo: authRedirectUrl(),
      },
    });
    setBusy(false);
    if (error) {
      setErrors({ form: errorMessage(error) });
      return;
    }
    // With email confirmation on, there is no session until the link is clicked.
    if (!data.session) setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <View style={[styles.done, { backgroundColor: c.background, paddingTop: insets.top + 80 }]}>
        <EmptyState
          icon="mail-unread-outline"
          title="Check your inbox"
          message={`We’ve sent a confirmation link to ${sentTo}. Open it, then come back and sign in.`}
        />
        <Button title="Back to sign in" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + 56, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="title">Create your account</Text>
          <Text variant="body" color="textMuted">
            You’ll join your club with a code from your captain next.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <TextField label="First name" value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" textContentType="givenName" error={errors.firstName} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Surname" value={form.surname} onChangeText={set('surname')} autoComplete="family-name" textContentType="familyName" error={errors.surname} />
          </View>
        </View>
        <TextField
          label="Email"
          value={form.email}
          onChangeText={set('email')}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          error={errors.email}
        />
        <TextField
          label="Password"
          value={form.password}
          onChangeText={set('password')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.password}
          hint="At least 8 characters"
        />
        <TextField
          label="Confirm password"
          value={form.confirm}
          onChangeText={set('confirm')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.confirm}
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: form.consent }}
          onPress={() => set('consent')(!form.consent)}
          style={[styles.consent, { borderColor: errors.consent ? c.danger : c.border, backgroundColor: c.surface }]}>
          <View style={[styles.box, { borderColor: form.consent ? c.accent : c.textFaint, backgroundColor: form.consent ? c.accent : 'transparent' }]}>
            {form.consent ? <Ionicons name="checkmark" size={16} color={c.onAccent} /> : null}
          </View>
          <Text variant="small" color="textMuted" style={{ flex: 1 }}>
            I’m 13 or over (or a parent/guardian is setting this up), and I agree to the{' '}
            <Text variant="smallBold" color="accent" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}>
              privacy policy
            </Text>
            . My club will see my name, availability, injury status and results.
          </Text>
        </Pressable>

        {errors.form ? (
          <Text variant="small" color="danger">
            {errors.form}
          </Text>
        ) : null}
        <EmailLinkWarning />
        <Button title="Create account" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  done: { flex: 1, padding: space.lg, gap: space.lg },
  consent: { flexDirection: 'row', gap: space.md, padding: space.lg, borderWidth: 1, borderRadius: radius.md },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
