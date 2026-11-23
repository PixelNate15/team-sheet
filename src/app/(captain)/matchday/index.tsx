import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Chip, EmptyState, ErrorState, Skeleton } from '@/components/Bits';
import { Button, IconButton } from '@/components/Button';
import { FixtureCard } from '@/components/FixtureCard';
import { Screen } from '@/components/Screen';
import { SquadSwitcher } from '@/components/SquadSwitcher';
import { Text } from '@/components/Text';
import { fetchSquadFixtures } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { useRefreshAll } from '@/lib/hooks';
import type { SquadFixture } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

/** Upcoming fixtures for the captain's squad (left column of captain_manage_fixtures.py). */
export default function Matchday() {
  const { activeSquad } = useSignedIn();
  const refresh = useRefreshAll();
  const q = useQuery({
    queryKey: ['squadFixtures', activeSquad?.id],
    queryFn: () => fetchSquadFixtures(activeSquad!.id),
    enabled: !!activeSquad,
  });
  const add = () => router.push('/fixture-edit');

  return (
    <Screen onRefresh={refresh}>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="add" label="Add fixture" onPress={add} /> }} />
      <SquadSwitcher />

      {q.isPending ? (
        <Skeleton count={3} height={150} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No upcoming fixtures"
          message="Add your next match and your squad will be asked for their availability."
          action={{ title: 'Add fixture', onPress: add }}
        />
      ) : (
        <>
          {(q.data ?? []).map((f) => (
            <FixtureCard
              key={f.id}
              opponent={f.opponent_name}
              isHome={f.is_home}
              date={f.fixture_date}
              time={f.start_time}
              location={f.location}
              onPress={() => router.push({ pathname: '/fixture/[id]', params: { id: String(f.id) } })}
              accent={f.team_selected ? 'success' : undefined}
              chips={f.team_selected ? <Chip label="Team picked" tone="success" icon="checkmark-circle" /> : <Chip label="Team not picked" tone="warning" />}
              footer={<ReplyBar f={f} />}
            />
          ))}
          <Button title="Add fixture" icon="add" variant="secondary" onPress={add} />
        </>
      )}
    </Screen>
  );
}

/** In / out / waiting bar so the captain sees replies at a glance. */
function ReplyBar({ f }: { f: SquadFixture }) {
  const { c } = useTheme();
  const total = f.available_count + f.unavailable_count + f.no_reply_count || 1;
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.bar, { backgroundColor: c.surfaceAlt }]}>
        <View style={{ flex: f.available_count / total, backgroundColor: c.success }} />
        <View style={{ flex: f.unavailable_count / total, backgroundColor: c.danger }} />
        <View style={{ flex: f.no_reply_count / total }} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Text variant="small" color="success">
          {f.available_count} in
        </Text>
        <Text variant="small" color="danger">
          {f.unavailable_count} out
        </Text>
        <Text variant="small" color="textMuted">
          {f.no_reply_count} waiting
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 8, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row' },
});
