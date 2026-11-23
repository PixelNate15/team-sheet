import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Text } from '@/components/Text';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });

type Errors = Partial<Record<'password' | 'confirm' | 'form', string>>;

/** Reached from the password-reset email (via auth-callback), already signed in by the link. */
export default function ResetPassword() {
  const { c } = useTheme();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const e: Errors = {};
      for (const issue of parsed.error.issues) e[issue.path[0] as keyof Errors] ??= issue.message;
      setErrors(e);
      return;
    }
    setErrors({});
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);
    if (error) {
      setErrors({ form: errorMessage(error) });
      return;
    }
    Alert.alert('Password changed', 'Use your new password next time you sign in.');
    router.replace('/');
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="title">Choose a new password</Text>
        <Text variant="body" color="textMuted">
          You’re signed in from the email link. Set a new password to finish.
        </Text>
      </View>
      <TextField
        label="New password"
        value={form.password}
        onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password}
        hint="At least 8 characters"
      />
      <TextField
        label="Confirm password"
        value={form.confirm}
        onChangeText={(v) => setForm((f) => ({ ...f, confirm: v }))}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.confirm}
      />
      {errors.form ? (
        <Text variant="small" color="danger">
          {errors.form}
        </Text>
      ) : null}
      <Button title="Save password" onPress={save} loading={busy} />
    </ScrollView>
  );
}
