import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Text } from '@/components/Text';
import { createClub } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { space, useTheme } from '@/theme';

const thisSeason = () => {
  const y = new Date().getFullYear();
  return new Date().getMonth() >= 8 ? `Winter ${y}/${String(y + 1).slice(2)}` : `Summer ${y}`;
};

const schema = z.object({
  clubName: z.string().trim().min(2, 'Enter the club name').max(100),
  squadName: z.string().trim().min(1, 'Name your team').max(50),
  divisionName: z.string().trim().min(1, 'Enter the division').max(50),
  teamCount: z.coerce.number().int('Whole number').min(2, 'At least 2 teams').max(40, 'At most 40 teams'),
  seasonName: z.string().trim().min(1, 'Name the season').max(50),
});

type Field = keyof z.input<typeof schema>;

export default function CreateClub() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { refreshMe } = useAuth();
  const [form, setForm] = useState<Record<Field, string>>({
    clubName: '',
    squadName: 'Men’s 1st Team',
    divisionName: 'Division 1',
    teamCount: '8',
    seasonName: thisSeason(),
  });
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: Field) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const e: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) e[issue.path[0] as Field] ??= issue.message;
      setErrors(e);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await createClub(parsed.data);
      await refreshMe();
    } catch (e) {
      setErrors({ form: errorMessage(e) });
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + 56, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="title">Set up your club</Text>
          <Text variant="body" color="textMuted">
            You’ll be the club admin and captain of the first team. You can add more teams and divisions later.
          </Text>
        </View>

        <TextField label="Club name" value={form.clubName} onChangeText={set('clubName')} placeholder="e.g. Riverside LTC" error={errors.clubName} />

        <SectionHeader title="Your first team" />
        <TextField label="Team name" value={form.squadName} onChangeText={set('squadName')} error={errors.squadName} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 2 }}>
            <TextField label="League division" value={form.divisionName} onChangeText={set('divisionName')} error={errors.divisionName} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Teams in it"
              value={form.teamCount}
              onChangeText={set('teamCount')}
              keyboardType="number-pad"
              error={errors.teamCount}
            />
          </View>
        </View>
        <Text variant="small" color="textFaint">
          The number of teams is used to weight form by opponent league position.
        </Text>

        <SectionHeader title="Season" />
        <TextField label="Current season" value={form.seasonName} onChangeText={set('seasonName')} error={errors.seasonName} />

        {errors.form ? (
          <Text variant="small" color="danger">
            {errors.form}
          </Text>
        ) : null}
        <Button title="Create club" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
