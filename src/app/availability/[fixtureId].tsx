import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { CloseButton } from '@/components/CloseButton';
import { Segmented, TextField } from '@/components/Field';
import { Text } from '@/components/Text';
import { mediumDate, opponentLabel } from '@/lib/format';
import { useMyFixtures, useSetAvailability } from '@/lib/hooks';
import type { MyFixture } from '@/lib/types';
import { space, useTheme } from '@/theme';

/** Bottom sheet: set or change availability (port of member_select_availability_screen). */
export default function AvailabilitySheet() {
  const { fixtureId } = useLocalSearchParams<{ fixtureId: string }>();
  const fixtures = useMyFixtures();
  if (fixtures.isPending) return <Loading />;
  const fixture = fixtures.data?.find((f) => f.id === Number(fixtureId));
  return <AvailabilityForm fixtureId={Number(fixtureId)} fixture={fixture} />;
}

function AvailabilityForm({ fixtureId, fixture }: { fixtureId: number; fixture: MyFixture | undefined }) {
  const { c } = useTheme();
  const setAvail = useSetAvailability();
  // Opened from "Can't make it" unless they'd already said yes.
  const [available, setAvailable] = useState<'yes' | 'no'>(fixture?.is_available ? 'yes' : 'no');
  const [reason, setReason] = useState(fixture?.reason ?? '');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  async function save() {
    await setAvail.mutateAsync({ fixtureId, available: available === 'yes', reason });
    router.back();
  }

  return (
    <ScrollView
      ref={scroll}
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: space.xl, gap: space.lg }}
      // The sheet is short, so make room for the keyboard and let the reason box scroll above it.
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive">
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="caption" color="textMuted">
            AVAILABILITY
          </Text>
          <CloseButton />
        </View>
        <Text variant="title">{fixture ? opponentLabel(fixture) : 'Fixture'}</Text>
        {fixture ? (
          <Text variant="body" color="textMuted">
            {mediumDate(fixture.fixture_date)}
          </Text>
        ) : null}
      </View>

      <Segmented
        value={available}
        onChange={setAvailable}
        options={[
          { value: 'yes', label: 'I can play' },
          { value: 'no', label: 'I can’t play' },
        ]}
      />

      {available === 'no' ? (
        <TextField
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Away on holiday"
          maxLength={500}
          multiline
          // Wait for the keyboard to finish opening, then bring the box and Save button into view.
          onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 350)}
        />
      ) : null}

      <Button title="Save" onPress={save} loading={setAvail.isPending} />
    </ScrollView>
  );
}
