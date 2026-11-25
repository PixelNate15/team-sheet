import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip, EmptyState, ErrorState, Skeleton } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Field';
import { FixtureCard } from '@/components/FixtureCard';
import { Screen } from '@/components/Screen';
import { useSignedIn } from '@/lib/auth';
import { useMyFixtures, useRefreshAll, useSetAvailability } from '@/lib/hooks';
import type { MyFixture } from '@/lib/types';
import { space } from '@/theme';

type Filter = 'all' | 'reply' | 'selected';

/**
 * One list replaces the original Availability screen (with its submitted /
 * not-submitted toggle) and the Selected Fixtures screen.
 */
export default function Fixtures() {
  const { me } = useSignedIn();
  const q = useMyFixtures();
  const refresh = useRefreshAll();
  const [filter, setFilter] = useState<Filter>('all');

  const all = q.data ?? [];
  const list =
    filter === 'reply' ? all.filter((f) => f.is_available == null) : filter === 'selected' ? all.filter((f) => f.is_selected) : all;

  return (
    <Screen onRefresh={refresh}>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Upcoming' },
          { value: 'reply', label: `Needs reply${all.some((f) => f.is_available == null) ? ` (${all.filter((f) => f.is_available == null).length})` : ''}` },
          { value: 'selected', label: 'Selected' },
        ]}
      />
      {!me.mySquadId ? (
        <EmptyState icon="people-outline" title="You’re not in a team yet" message="Fixtures appear once you’ve been added to a squad." />
      ) : q.isPending ? (
        <Skeleton count={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={filter === 'reply' ? 'checkmark-done-outline' : 'calendar-outline'}
          title={filter === 'reply' ? 'All caught up' : filter === 'selected' ? 'Not selected yet' : 'No upcoming fixtures'}
          message={
            filter === 'reply'
              ? 'You’ve replied to every fixture.'
              : filter === 'selected'
                ? 'Fixtures you’re picked for will show here.'
                : 'Your captain hasn’t added any fixtures yet.'
          }
        />
      ) : (
        <View style={{ gap: space.md }}>
          {list.map((f) => (
            <FixtureRow key={f.id} f={f} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function FixtureRow({ f }: { f: MyFixture }) {
  const setAvail = useSetAvailability();
  const open = () => router.push({ pathname: '/fixture/[id]', params: { id: String(f.id) } });
  const openSheet = () => router.push({ pathname: '/availability/[fixtureId]', params: { fixtureId: String(f.id) } });

  return (
    <FixtureCard
      opponent={f.opponent_name}
      isHome={f.is_home}
      date={f.fixture_date}
      time={f.start_time}
      location={f.location}
      onPress={open}
      accent={f.is_selected ? 'success' : undefined}
      chips={
        <>
          {f.is_borrowed ? <Chip label={`Playing up · ${f.squad_name}`} tone="accent" icon="arrow-up-circle" /> : null}
          {f.is_selected ? <Chip label={`Selected · Pair ${f.pair_number}`} tone="success" icon="checkmark-circle" /> : null}
          {f.is_available === true && !f.is_selected ? <Chip label="Available" tone="accent" icon="thumbs-up" /> : null}
          {f.is_available === false ? <Chip label="Unavailable" tone="danger" icon="thumbs-down" /> : null}
          {f.is_available == null ? <Chip label="Reply needed" tone="warning" icon="alert-circle" /> : null}
          {f.team_selected && !f.is_selected ? <Chip label="Team picked" tone="neutral" /> : null}
        </>
      }
      footer={
        f.is_available == null ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              title="I’m in"
              icon="checkmark"
              size="sm"
              style={{ flex: 1 }}
              loading={setAvail.isPending}
              onPress={() => setAvail.mutate({ fixtureId: f.id, available: true })}
            />
            <Button title="Can’t make it" icon="close" size="sm" variant="secondary" style={{ flex: 1 }} onPress={openSheet} />
          </View>
        ) : (
          <Button title="Change availability" size="sm" variant="ghost" full={false} onPress={openSheet} />
        )
      }
    />
  );
}
