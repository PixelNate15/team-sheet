import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { EmptyState, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { DateField } from '@/components/Pickers';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { addAwayPeriod, deleteAwayPeriod, fetchMyAwayPeriods } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { fullDate, toIsoDate } from '@/lib/format';
import { confirm } from '@/lib/hooks';
import { space } from '@/theme';

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/**
 * Holidays and other away dates. Every fixture in the range (including ones
 * added later) is marked "can't play" automatically, unless you'd already replied.
 */
export default function AwayDates() {
  const qc = useQueryClient();
  const { userId } = useSignedIn();
  const [from, setFrom] = useState(inDays(1));
  const [to, setTo] = useState(inDays(7));
  const [note, setNote] = useState('');

  const periods = useQuery({ queryKey: ['awayPeriods', userId], queryFn: () => fetchMyAwayPeriods(userId) });

  const add = useMutation({
    mutationFn: () => {
      if (to < from) throw new Error('The end date is before the start date.');
      return addAwayPeriod(from, to, note);
    },
    onSuccess: async (n) => {
      setNote('');
      await qc.invalidateQueries();
      Alert.alert(
        'Away dates saved',
        n === 0
          ? 'No fixtures in those dates yet. Any added later will be marked automatically.'
          : `${n} fixture${n === 1 ? '' : 's'} marked as “can’t play”. Fixtures added later will be too.`,
      );
    },
    onError: (e) => Alert.alert('Couldn’t save', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteAwayPeriod(id),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => Alert.alert('Couldn’t remove', errorMessage(e)),
  });

  return (
    <Screen>
      <Text variant="body" color="textMuted">
        Going on holiday? Add the dates and every fixture in them is marked as “can’t play”, including ones added later.
        Replies you’ve already given stay as they are.
      </Text>

      <Card>
        <View style={{ gap: space.md }}>
          {/* Stacked: iOS's compact date pickers are too wide to sit side by side in a card. */}
          <DateField label="From" value={from} onChange={setFrom} minimumDate={new Date()} />
          <DateField label="To" value={to} onChange={setTo} minimumDate={new Date()} />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Holiday" maxLength={100} />
          <Button title="Add away dates" icon="airplane-outline" loading={add.isPending} onPress={() => add.mutate()} />
        </View>
      </Card>

      <SectionHeader title="Your away dates" />
      {(periods.data ?? []).length === 0 ? (
        <EmptyState icon="calendar-outline" title="None coming up" message="Dates you add appear here until they’ve passed." />
      ) : (
        <Card>
          <View style={{ gap: space.md }}>
            {(periods.data ?? []).map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">
                    {fullDate(p.starts_on)} – {fullDate(p.ends_on)}
                  </Text>
                  {p.note ? (
                    <Text variant="small" color="textMuted">
                      {p.note}
                    </Text>
                  ) : null}
                </View>
                <Text
                  variant="smallBold"
                  color="danger"
                  accessibilityRole="button"
                  onPress={async () => {
                    if (await confirm('Remove these dates?', 'The automatic “can’t play” replies for them will be cleared.')) remove.mutate(p.id);
                  }}>
                  Remove
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}
    </Screen>
  );
}
