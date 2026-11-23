import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { SwitchRow, TextField } from '@/components/Field';
import { DateField } from '@/components/Pickers';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { endInjury, saveInjury } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { toIsoDate } from '@/lib/format';
import { confirm, useMyInjury, useRefreshAll } from '@/lib/hooks';
import type { Injury } from '@/lib/types';
import { space } from '@/theme';

const inTwoWeeks = () => toIsoDate(new Date(Date.now() + 14 * 86_400_000));

/** View + edit injury in one place (ports member_view/edit_injury_status_screen). */
export default function InjuryScreen() {
  const injury = useMyInjury();
  if (injury.isPending) return <Loading />;
  return <InjuryForm current={injury.data ?? null} />;
}

function InjuryForm({ current }: { current: Injury | null }) {
  const { userId } = useSignedIn();
  const refresh = useRefreshAll();

  const [description, setDescription] = useState(current?.description ?? '');
  const [returnDate, setReturnDate] = useState(current?.expected_end_date ?? inTwoWeeks());
  const [canPlay, setCanPlay] = useState(current?.can_play ?? false);
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveInjury(userId, current?.id ?? null, { description, expected_end_date: returnDate, can_play: canPlay, notes }),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: (e) => Alert.alert('Couldn’t save', errorMessage(e)),
  });

  const recover = useMutation({
    mutationFn: () => endInjury(current!.id),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: (e) => Alert.alert('Couldn’t update', errorMessage(e)),
  });

  function submit() {
    if (!description.trim()) {
      setError('Describe the injury, e.g. “Sprained ankle”.');
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <Screen footer={<Button title={current ? 'Save changes' : 'Report injury'} onPress={submit} loading={save.isPending} />}>
      <Text variant="body" color="textMuted">
        Your captain sees this when picking the team. If you can’t play, you won’t be suggested for selection.
      </Text>
      <TextField label="Injury" value={description} onChangeText={setDescription} placeholder="e.g. Sprained ankle" maxLength={200} error={error} />
      <DateField label="Expected return" value={returnDate} onChange={setReturnDate} minimumDate={new Date()} />
      <SwitchRow
        label="I can still play"
        description="e.g. playing through it with strapping"
        value={canPlay}
        onValueChange={setCanPlay}
      />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} />

      {current ? (
        <View style={{ marginTop: space.md }}>
          <Button
            title="I’ve recovered"
            icon="checkmark-circle-outline"
            variant="secondary"
            loading={recover.isPending}
            onPress={async () => {
              if (await confirm('Mark as recovered?', 'Your captain will see you as fit again.', 'Recovered', false)) recover.mutate();
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
